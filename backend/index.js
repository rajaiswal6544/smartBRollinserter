const express = require('express');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const tmp = require('tmp');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const app = express();
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|avi|mov|mkv|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype.startsWith('video/');
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

app.use(cors());
app.use(express.json());

// Helper: Download video from URL to temp path
async function downloadVideo(url, tempPath) {
  try {
    console.log(`Attempting to download from: ${url}`);
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: 30000 // 30 second timeout
    });
    const writer = fs.createWriteStream(tempPath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`Successfully downloaded to: ${tempPath}`);
        resolve();
      });
      writer.on('error', (err) => {
        console.error(`Download write error: ${err.message}`);
        reject(err);
      });
    });
  } catch (error) {
    console.error(`Failed to download video from ${url}:`, error.message);
    throw new Error(`Video download failed: ${error.message}`);
  }
}

// Helper: Extract transcript from A-roll (using OpenAI Whisper)
async function getTranscript(videoPath) {
  try {
    console.log(`Transcribing video: ${videoPath}`);
    // Create a read stream for the video file
    const audioStream = fs.createReadStream(videoPath);
    const response = await openai.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment']
    });
    console.log(`Transcription successful. Segments: ${response.segments?.length || 0}`);
    return response.segments || [];
  } catch (error) {
    console.error('OpenAI Whisper transcription error:', error.message);
    if (error.code === 'ENOTFOUND' || error.message.includes('Connection')) {
      throw new Error('Cannot connect to OpenAI API. Check your internet connection and API key.');
    }
    if (error.status === 401) {
      throw new Error('Invalid OpenAI API key. Please check your .env file.');
    }
    throw new Error(`Transcription failed: ${error.message}`);
  }
}

// Helper: Extract key frame from video
async function extractKeyFrame(videoPath) {
  const outputPath = tmp.tmpNameSync({ postfix: '.jpg' });
  const outputDir = path.dirname(outputPath);
  const outputFilename = path.basename(outputPath);
  
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['50%'],
        filename: outputFilename,
        folder: outputDir,
        size: '640x?'
      })
      .on('end', () => {
        console.log('Frame extracted:', outputPath);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('Frame extraction error:', err);
        reject(err);
      });
  });
}

// Helper: Analyze frame with Vision API
async function analyzeFrameWithVision(imagePath) {
  try {
    const imageBuffer = await fs.promises.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: 'Describe this video frame in 1-2 concise sentences suitable for B-roll matching. Focus on the main subject, action, and visual elements.' 
          },
          { 
            type: 'image_url', 
            image_url: { 
              url: `data:image/jpeg;base64,${base64Image}` 
            } 
          }
        ]
      }],
      max_tokens: 100
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Vision API error:', error.message);
    throw new Error(`Vision analysis failed: ${error.message}`);
  }
}

// Helper: Describe B-roll clip (using metadata if provided, or Vision API)
async function describeBroll(clipPath, broll) {
  const duration = await getVideoDuration(clipPath);
  
  // If metadata provided, use it
  if (broll.metadata && broll.metadata.trim() !== '') {
    console.log(`Using provided metadata for ${broll.id}: "${broll.metadata}"`);
    return { id: broll.id, description: broll.metadata, duration };
  }
  
  // Auto-analyze with Vision API
  console.log(`No metadata for ${broll.id}, analyzing with Vision API...`);
  try {
    const framePath = await extractKeyFrame(clipPath);
    const description = await analyzeFrameWithVision(framePath);
    
    // Cleanup frame
    if (fs.existsSync(framePath)) {
      fs.unlinkSync(framePath);
    }
    
    console.log(`Vision API description for ${broll.id}: "${description}"`);
    return { id: broll.id, description, duration };
  } catch (error) {
    console.error(`Failed to analyze ${broll.id}:`, error.message);
    // Fallback to generic description
    return { id: broll.id, description: 'B-roll video clip', duration };
  }
}

// Helper: Get video duration
function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) reject(err);
      resolve(metadata.format.duration);
    });
  });
}

// Helper: Semantic matching using embeddings
async function matchBrollToSegment(segmentText, brollDescriptions) {
  const segmentEmbedding = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: segmentText
  }).then(res => res.data[0].embedding);

  let bestMatch = { id: null, score: 0, reason: '' };
  for (const broll of brollDescriptions) {
    const brollEmbedding = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: broll.description
    }).then(res => res.data[0].embedding);

    const similarity = cosineSimilarity(segmentEmbedding, brollEmbedding);
    if (similarity > bestMatch.score && similarity > 0.4) {
      bestMatch = { id: broll.id, score: similarity, reason: `Semantic match between "${segmentText}" and "${broll.description}"` };
    }
  }
  return bestMatch;
}

// Cosine similarity
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

// Endpoint: Upload files
app.post('/upload', upload.fields([
  { name: 'a_roll', maxCount: 1 },
  { name: 'b_rolls', maxCount: 6 }
]), (req, res) => {
  try {
    console.log('Processing file upload...');
    
    if (!req.files || !req.files.a_roll) {
      return res.status(400).json({ error: 'Missing A-roll video file' });
    }
    
    if (!req.files.b_rolls || req.files.b_rolls.length === 0) {
      return res.status(400).json({ error: 'Missing B-roll video files' });
    }
    
    if (req.files.b_rolls.length > 6) {
      return res.status(400).json({ error: 'Maximum 6 B-roll files allowed' });
    }
    
    const aRollPath = req.files.a_roll[0].path;
    const bRollPaths = req.files.b_rolls.map((file, idx) => ({
      id: `b_roll_${idx}`,
      path: file.path,
      filename: file.originalname
    }));
    
    console.log('Files uploaded successfully');
    console.log('A-roll:', aRollPath);
    console.log('B-rolls:', bRollPaths.length);
    
    res.json({
      a_roll: aRollPath,
      b_rolls: bRollPaths
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed', message: error.message });
  }
});

// Endpoint: Generate plan from uploaded files
app.post('/generate-plan', async (req, res) => {
  const filesToCleanup = [];
  
  try {
    console.log('Received generate-plan request:', JSON.stringify(req.body, null, 2));
    const { a_roll, b_rolls } = req.body;
    
    if (!a_roll) {
      return res.status(400).json({ error: 'Missing a_roll path' });
    }
    if (!b_rolls || !Array.isArray(b_rolls)) {
      return res.status(400).json({ error: 'Missing or invalid b_rolls array' });
    }
    
    // Track files for cleanup
    filesToCleanup.push(a_roll);
    b_rolls.forEach(b => filesToCleanup.push(b.path));
    
    // 1. Get A-roll transcript
    console.log('Extracting transcript from:', a_roll);
    const segments = await getTranscript(a_roll);
    const aRollDuration = await getVideoDuration(a_roll);
    console.log('Transcript extracted. Segments:', segments.length);
    
    // 2. Describe B-rolls
    console.log('Processing B-roll descriptions...');
    const brollDescriptions = [];
    for (let i = 0; i < b_rolls.length; i++) {
      const broll = b_rolls[i];
      const desc = await describeBroll(broll.path, broll);
      brollDescriptions.push(desc);
    }
    
    // 3. Matching logic
    console.log('Matching B-rolls to segments...');
    const insertions = [];
    let lastInsertEnd = 0;
    for (const segment of segments) {
      if (segment.start - lastInsertEnd < 3) continue;
      if (segment.end - segment.start < 1) continue;
      
      const match = await matchBrollToSegment(segment.text, brollDescriptions);
      if (match.id) {
        const broll = brollDescriptions.find(b => b.id === match.id);
        const duration = Math.min(broll.duration, 5);
        insertions.push({
          start_sec: segment.start,
          duration_sec: duration,
          broll_id: match.id,
          confidence: match.score,
          reason: match.reason
        });
        lastInsertEnd = segment.start + duration;
      }
    }
    
    // Limit to 3-6
    insertions.sort((a, b) => b.confidence - a.confidence);
    const finalInsertions = insertions.slice(0, Math.min(6, Math.max(3, insertions.length)));
    
    const plan = {
      a_roll_duration: aRollDuration,
      transcript_segments: segments,
      insertions: finalInsertions
    };
    
    console.log('Plan generated successfully. Insertions:', finalInsertions.length);
    
    // Cleanup uploaded files
    filesToCleanup.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('Cleaned up:', filePath);
      }
    });
    
    res.json(plan);
  } catch (error) {
    console.error('Error processing request:', error);
    
    // Cleanup on error
    filesToCleanup.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    });
    
    res.status(500).json({
      error: 'Failed to generate plan',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Endpoint: Generate plan from JSON URLs
app.post('/generate-plan-from-urls', async (req, res) => {
  let aRollTemp = null;
  const bRollTemps = [];
  
  try {
    console.log('Received request:', JSON.stringify(req.body, null, 2));
    const { a_roll, b_rolls } = req.body; // Expect JSON like in video_url.json

    if (!a_roll || !a_roll.url) {
      return res.status(400).json({ error: 'Missing a_roll.url in request body' });
    }
    if (!b_rolls || !Array.isArray(b_rolls)) {
      return res.status(400).json({ error: 'Missing or invalid b_rolls array in request body' });
    }

    // Download A-roll
    console.log('Downloading A-roll from:', a_roll.url);
    aRollTemp = tmp.tmpNameSync({ postfix: '.mp4' });
    await downloadVideo(a_roll.url, aRollTemp);
    console.log('A-roll downloaded to:', aRollTemp);

    // Download B-rolls
    console.log('Downloading B-rolls...');
    for (const broll of b_rolls) {
      const tempPath = tmp.tmpNameSync({ postfix: '.mp4' });
      await downloadVideo(broll.url, tempPath);
      bRollTemps.push(tempPath);
      console.log('B-roll downloaded:', broll.id);
    }

    // 1. Get A-roll transcript
    console.log('Extracting transcript...');
    const segments = await getTranscript(aRollTemp);
    const aRollDuration = await getVideoDuration(aRollTemp);
    console.log('Transcript extracted. Segments:', segments.length);

    // 2. Describe B-rolls (using metadata)
    console.log('Processing B-roll descriptions...');
    const brollDescriptions = [];
    for (let i = 0; i < b_rolls.length; i++) {
      const desc = await describeBroll(bRollTemps[i], b_rolls[i]);
      brollDescriptions.push(desc);
    }

    // 3. Matching logic
    console.log('Matching B-rolls to segments...');
    const insertions = [];
    let lastInsertEnd = 0;
    for (const segment of segments) {
      if (segment.start - lastInsertEnd < 3) continue;
      if (segment.end - segment.start < 1) continue;
      
      const match = await matchBrollToSegment(segment.text, brollDescriptions);
      if (match.id) {
        const broll = brollDescriptions.find(b => b.id === match.id);
        const duration = Math.min(broll.duration, 5);
        insertions.push({
          start_sec: segment.start,
          duration_sec: duration,
          broll_id: match.id,
          confidence: match.score,
          reason: match.reason
        });
        lastInsertEnd = segment.start + duration;
      }
    }

    // Limit to 3-6
    insertions.sort((a, b) => b.confidence - a.confidence);
    const finalInsertions = insertions.slice(0, Math.min(6, Math.max(3, insertions.length)));

    const plan = {
      a_roll_duration: aRollDuration,
      transcript_segments: segments,
      insertions: finalInsertions
    };

    console.log('Plan generated successfully. Insertions:', finalInsertions.length);

    // Cleanup temps
    if (aRollTemp && fs.existsSync(aRollTemp)) {
      fs.unlinkSync(aRollTemp);
    }
    bRollTemps.forEach(p => {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });

    res.json(plan);
  } catch (error) {
    console.error('Error processing request:', error);
    
    // Cleanup temps on error
    try {
      if (aRollTemp && fs.existsSync(aRollTemp)) {
        fs.unlinkSync(aRollTemp);
      }
      bRollTemps.forEach(p => {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      });
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }

    res.status(500).json({ 
      error: 'Failed to process video',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        status: 'error', 
        message: 'OPENAI_API_KEY not configured in .env file' 
      });
    }
    
    // Test OpenAI API connectivity
    const testResponse = await openai.models.list();
    
    res.json({ 
      status: 'ok',
      message: 'Backend is running and OpenAI API is accessible',
      openai_connected: true
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(500).json({ 
      status: 'error',
      message: 'OpenAI API connection failed',
      error: error.message,
      hint: error.code === 'ENOTFOUND' ? 'Check your internet connection' : 'Check your API key'
    });
  }
});

app.listen(3001, () => {
  console.log('Backend running on port 3001');
  console.log('OpenAI API Key configured:', !!process.env.OPENAI_API_KEY);
  console.log('Test the server with: http://localhost:3001/health');
});
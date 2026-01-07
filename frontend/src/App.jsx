import React, { useState } from 'react';
import axios from 'axios';
import { 
  Container, 
  Typography, 
  Box, 
  Grid, 
  CircularProgress, 
  Alert,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
} from '@mui/material';
import { 
  CloudUpload as UploadIcon, 
  Movie as MovieIcon, 
  AutoFixHigh as MagicIcon,
  Delete as DeleteIcon,
  VideoLibrary as VideoLibraryIcon,
  Description as TranscriptIcon
} from '@mui/icons-material';

function App() {
  const [aRoll, setARoll] = useState(null);
  const [bRolls, setBRolls] = useState([]);
  const [paths, setPaths] = useState({ a_roll: '', b_rolls: [] });
  const [plan, setPlan] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  const handleARollChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setARoll(e.target.files[0]);
      setError(null);
    }
  };

  const handleBRollChange = (e) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setBRolls(prev => [...prev, ...newFiles]);
      setError(null);
    }
  };

  const removeBRoll = (index) => {
    setBRolls(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!aRoll) {
      setError('Please select an A-roll video.');
      return;
    }
    if (bRolls.length === 0) {
      setError('Please select at least one B-roll video.');
      return;
    }

    setIsUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('a_roll', aRoll);
    bRolls.forEach((file) => formData.append('b_rolls', file));
    
    try {
      const res = await axios.post('http://localhost:3001/upload', formData, { 
        headers: { 'Content-Type': 'multipart/form-data' } 
      });
      setPaths(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const generatePlan = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await axios.post('http://localhost:3001/generate-plan', paths);
      setPlan(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Plan generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Box sx={{ textAlign: 'center', mb: 8 }}>
        <Typography variant="h1" gutterBottom sx={{ fontSize: { xs: '2.5rem', md: '4rem' } }}>
          Smart B-Roll Inserter
        </Typography>
        <Typography variant="subtitle1" color="var(--text-secondary)" sx={{ fontSize: '1.2rem' }}>
          AI-powered video editing for professional talking-head videos
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 4, borderRadius: '12px' }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={4}>
        {/* Upload Section */}
        <Grid item xs={12} md={paths.a_roll ? 4 : 12}>
          <Box className="glass-panel" sx={{ p: 4, height: '100%' }}>
            <Typography variant="h6" gutterBottom display="flex" alignItems="center">
              <UploadIcon sx={{ mr: 1, color: 'var(--accent-primary)' }} />
              Upload Assets
            </Typography>
            
            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" color="var(--text-secondary)" gutterBottom>
                A-Roll (Talking Head)
              </Typography>
              <div className="file-input-wrapper">
                {aRoll ? (
                  <Typography variant="body2" sx={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                    {aRoll.name}
                  </Typography>
                ) : (
                  <Typography variant="body2">Click or drag to upload A-Roll</Typography>
                )}
                <input type="file" onChange={handleARollChange} accept="video/*" />
              </div>

              <Typography variant="body2" color="var(--text-secondary)" gutterBottom sx={{ mt: 3 }}>
                B-Rolls (Supplementary Clips)
              </Typography>
              <div className="file-input-wrapper">
                <Typography variant="body2">Add B-Roll clips</Typography>
                <input type="file" multiple onChange={handleBRollChange} accept="video/*" />
              </div>

              {bRolls.length > 0 && (
                <List sx={{ mt: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  {bRolls.map((file, index) => (
                    <ListItem 
                      key={index}
                      secondaryAction={
                        <IconButton edge="end" onClick={() => removeBRoll(index)} size="small" sx={{ color: 'var(--error)' }}>
                          <DeleteIcon />
                        </IconButton>
                      }
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <MovieIcon sx={{ color: 'var(--accent-secondary)', fontSize: 20 }} />
                      </ListItemIcon>
                      <ListItemText 
                        primary={file.name} 
                        primaryTypographyProps={{ variant: 'caption', noWrap: true }} 
                      />
                    </ListItem>
                  ))}
                </List>
              )}

              <button 
                className="btn-primary" 
                onClick={handleUpload} 
                disabled={isUploading || !aRoll || bRolls.length === 0}
                style={{ width: '100%', mt: 4 }}
              >
                {isUploading ? (
                  <><CircularProgress size={20} color="inherit" sx={{ mr: 1 }} /> Uploading...</>
                ) : (
                  'Upload Files'
                )}
              </button>
            </Box>
          </Box>
        </Grid>

        {/* Plan Section */}
        {paths.a_roll && (
          <Grid item xs={12} md={plan ? 12 : 8}>
            <Box className="glass-panel" sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Typography variant="h6" display="flex" alignItems="center">
                  <MagicIcon sx={{ mr: 1, color: 'var(--accent-primary)' }} />
                  AI Edit Plan
                </Typography>
                {!plan && (
                  <button 
                    className="btn-primary" 
                    onClick={generatePlan} 
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <><CircularProgress size={18} color="inherit" sx={{ mr: 1 }} /> Generating...</>
                    ) : (
                      'Generate AI Plan'
                    )}
                  </button>
                )}
              </Box>

              {plan && (
                <Grid container spacing={4}>
                  <Grid item xs={12} lg={7}>
                    <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <TranscriptIcon sx={{ mr: 1, fontSize: 18 }} /> Transcript Segments
                    </Typography>
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Segment Text</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.transcript_segments.map((seg, i) => (
                            <tr key={i}>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <span className="chip chip-accent">{seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s</span>
                              </td>
                              <td style={{ color: 'var(--text-secondary)' }}>{seg.text}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Grid>

                  <Grid item xs={12} lg={5}>
                    <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <VideoLibraryIcon sx={{ mr: 1, fontSize: 18 }} /> Planned Insertions
                    </Typography>
                    {plan.insertions.length > 0 ? (
                      <div className="table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>Insertion</th>
                              <th>B-Roll</th>
                              <th>Match</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plan.insertions.map((ins, i) => (
                              <tr key={i}>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{ins.start_sec.toFixed(1)}s</div>
                                  <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{ins.duration_sec.toFixed(1)}s dur</div>
                                </td>
                                <td><span className="chip chip-accent">{ins.broll_id}</span></td>
                                <td>
                                  <span className={`chip ${ins.confidence > 0.8 ? 'chip-success' : 'chip-accent'}`}>
                                    {Math.round(ins.confidence * 100)}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Box sx={{ p: 4, textAlign: 'center', bgcolor: 'rgba(239, 68, 68, 0.05)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <Typography color="var(--error)" variant="body2" fontWeight="600">
                          No optimal B-roll insertions found.
                        </Typography>
                        <Typography variant="caption" color="var(--text-secondary)">
                          Try adding more descriptive B-roll or content.
                        </Typography>
                      </Box>
                    )}
                  </Grid>
                </Grid>
              )}
            </Box>
          </Grid>
        )}
      </Grid>
    </Container>
  );
}

export default App;
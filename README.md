# Smart B-Roll Inserter

Editing talking-head videos is a tedious process. One of the most time-consuming parts is finding the right moments to insert B-roll clips and ensuring they match the context of what's being said. 

This project is an AI-powered assistant that automates that workflow. It "listens" to your A-roll video, analyzes the semantic meaning of your speech, and intelligently suggests exactly where your B-roll clips should go for maximum impact.

## The Approach

Instead of a generic keyword matcher, this tool uses a combination of modern AI models to behave more like a human editor:
1. **Speech Understanding**: It uses OpenAI's Whisper to transcribe the A-roll with precise segment-level timestamps.
2. **Visual Content Analysis**: If you don't provide descriptions for your B-roll, it uses GPT-4 Vision to "watch" the frames and describe what's happening.
3. **Semantic Alignment**: It uses text embeddings to calculate the relationship between what is being said (transcript) and what is being shown (B-roll), finding the most natural matches.

## The Stack

I chose a **unified JavaScript stack (Node.js + React)** for this project. While Python is often the go-to for AI scripting, using Node.js for the backend allowed me to build a seamless, type-safe ecosystem where the frontend and backend share logic and data structures easily. 

The backend handles the heavy lifting—file management, frame extraction using FFmpeg, and orchestrating the AI pipeline—while the React frontend provides a premium, interactive interface for creators to manage their assets and review the AI's suggestions.

### Key Tools
- **The Engine**: Node.js with Express and FFmpeg (`fluent-ffmpeg`) for video manipulation.
- **The Brain**: OpenAI's Whisper (Speech), Text-Embeddings (Matching), and GPT-4o (Vision).
- **The Interface**: React (Vite) with Material UI, designed for a fast, modern "AI-native" feel.

---

## Project Structure

```
smart-broll-inserter/
├── backend/
│   ├── index.js           # Main API server
│   ├── uploads/           # Temporary file storage
│   ├── .env              # OpenAI API key configuration
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx       # Main UI component
    │   ├── main.jsx
    │   └── index.css
    └── package.json
```

---

## Getting Started

### Prerequisites
- Node.js 16+ and npm
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))
- FFmpeg installed on your system

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure OpenAI API key:**
   Create a `.env` file in the `backend` directory:
   ```
   OPENAI_API_KEY=sk-proj-your-actual-key-here
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

   Server runs on `http://localhost:3001`

5. **Verify setup:**
   Visit `http://localhost:3001/health` to check API connectivity

### Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

   UI opens at `http://localhost:5173`

---

---

## Design Decisions & Challenges

Building an automated editor requires balancing AI accuracy with user creative control. Here are some of the key decisions I made during development:

### 1. The 5-Second Rule
To prevent the video from feeling "choppy," I implemented a heuristic that ensures at least a 5-second gap between B-roll insertions. This mimics human editing styles where you want to give the viewer time to process one clip before jumping to the next.

### 2. Vision API for Auto-Description
Manually tagging B-roll is a chore. By integrating GPT-4 Vision, the tool can automatically understand what's in a clip. I found that extracting a frame from the 50% mark of a clip usually gives the best representative sample of the content.

### 3. Handling Semantic Similarity
Instead of simple keyword matching, I used `text-embedding-ada-002`. This allows the tool to match a clip of "a person drinking coffee" to a transcript segment about "morning routines" or "relaxing at home," even if the word "coffee" isn't explicitly mentioned.

### 4. Why Node.js for Video?
While FFmpeg is a native binary, the `fluent-ffmpeg` wrapper for Node.js is incredibly powerful. It allowed me to handle complex filter chains (like time-based overlays) using a clean, object-oriented syntax that stays readable even as the project grows.

---

## Installation & Setup

### Prerequisites
- **Node.js**: Version 16 or higher.
- **FFmpeg**: Required for video processing and frame extraction.
- **OpenAI API Key**: For transcription, vision, and embeddings.

### 1. Backend Setup
```bash
cd backend
npm install
```
Create a `.env` file in the `backend` folder and add your key:
```bash
OPENAI_API_KEY=your_key_here
```
Start the server:
```bash
npm start
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The app will be running at `http://localhost:5173`.

---


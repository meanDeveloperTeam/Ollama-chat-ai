# Ollama Chat AI

A full-stack ChatGPT-like chat application with real-time streaming, multi-chat support, and persistent chat history using MongoDB.

## Features

- **ChatGPT-style UI**: Modern, responsive interface with sidebar, collapsible navigation, and chat input at the bottom.
- **Streaming AI Responses**: Real-time, token-by-token streaming from backend to frontend for a smooth chat experience.
- **Multi-Chat Support**: Create, switch, and manage multiple chat sessions, each with its own history.
- **Persistent Storage**: All chats and messages are saved in MongoDB for long-term access.
- **Bootstrap & Icons**: Clean design using Bootstrap 5 and Bootstrap Icons.
- **Collapsible Sidebar**: Sidebar can be toggled for a focused chat view.
- **Agent/Tool Ready**: Easily extendable to support multiple AI agents or tools.

## Technologies Used

- **Frontend**: Angular (with signals), Bootstrap 5, Bootstrap Icons
- **Backend**: Node.js, Express.js, Mongoose, MongoDB
- **AI Model**: Connects to Ollama or compatible LLM backend (streaming API)

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm
- MongoDB (local or Atlas)
- Ollama or compatible LLM backend running on `localhost:11434`

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd ollama-chat-ai
   ```

2. **Install backend dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd ..
   npm install
   ```

4. **Configure MongoDB**
   - Update the MongoDB connection string in `server/index.js` if needed.

5. **Start the backend server**
   ```bash
   cd server
   node index.js
   ```

6. **Start the Angular frontend**
   ```bash
   cd ..
   ng serve
   ```

7. **Ensure Ollama/LLM backend is running**
   - The backend expects an LLM API at `http://localhost:11434/api/generate`.

## Usage

- Open [http://localhost:4200](http://localhost:4200) in your browser.
- Create a new chat or select an existing one from the sidebar.
- Type your message and get real-time AI responses.
- All chats are saved and can be revisited anytime.

## API Endpoints (Backend)

- `POST /api/chats` — Create a new chat
- `GET /api/chats` — List all chats
- `GET /api/chats/:id` — Get a specific chat
- `POST /api/chats/:id/messages` — Add a message to a chat
- `POST /api/chat` — Stream AI response (proxy to LLM backend)

## Customization

- **Agents/Tools**: Extend the backend and frontend to support multiple AI agents or external tools.
- **Styling**: Modify `src/app/app.scss` and Bootstrap classes for a custom look.

## License

MIT

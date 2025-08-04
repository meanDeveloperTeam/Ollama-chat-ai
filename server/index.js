const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

app.use(bodyParser.json());
app.use(helmet());
app.use(cors('*'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

mongoose.connect('mongodb+srv://princeark786:Moyr8b1HQgnV4lx9@firstmongodb.prqz8aj.mongodb.net/?retryWrites=true&w=majority&appName=FirstMongoDB', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const chatSchema = new mongoose.Schema({
  title: String,
  userId: String,
  messages: [
    {
      role: String,
      content: String,
      embedding: {
        type: [Number],
        required: false // Embedding is optional, as it might be generated later
      }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', chatSchema);

// Helper function to generate embeddings using Ollama
async function generateEmbedding(text) {
  try {
    const response = await fetch("http://localhost:11434/api/embeddings", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text:latest', // Using the specified embedding model
        prompt: text
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama embedding API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    return null; // Return null or handle error as appropriate
  }
}

// Helper function to calculate cosine similarity
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }
  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }
  return dotProduct / (magnitudeA * magnitudeB);
}

app.get('/', (req, res) => {
  res.send('Hello from Express!');
});

app.post('/api/chats', async (req, res) => {
  try {
    const { title, userId, messages } = req.body;
    const chat = new Chat({ title, userId, messages: messages || [] });
    await chat.save();
    res.json({ success: true, chatId: chat._id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/chats', async (req, res) => {
  try {
    const chats = await Chat.find({}, 'title createdAt');
    res.json(chats);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/chats/:id', async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    res.json(chat);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/chats/:id/messages', async (req, res) => {
  try {
    const { role, content } = req.body;
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ success: false, error: 'Chat not found' });

    let embedding = null;
    if (content && role === 'user') { // Only embed user messages for retrieval
      embedding = await generateEmbedding(content);
    }

    chat.messages.push({ role, content, embedding });
    await chat.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
  const { prompt, chatId } = req.body;
  console.log("Received request for chat", prompt, "for chat ID", chatId);

  let augmentedPrompt = prompt;
  if (chatId) {
    try {
      const chat = await Chat.findById(chatId);
      if (chat && chat.messages.length > 0) {
        const queryEmbedding = await generateEmbedding(prompt);
        if (queryEmbedding) {
          const relevantMessages = chat.messages
            .filter(msg => msg.role === 'user' && msg.embedding) // Only consider user messages with embeddings
            .map(msg => ({
              message: msg.content,
              similarity: cosineSimilarity(queryEmbedding, msg.embedding)
            }))
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 3); // Get top 3 most similar messages

          if (relevantMessages.length > 0) {
            const context = relevantMessages.map(rm => `Past conversation: ${rm.message}`).join('\n');
            augmentedPrompt = `${context}\n\nUser query: ${prompt}`;
            console.log("Augmented prompt:", augmentedPrompt);
          }
        }
      }
    } catch (error) {
      console.error("Error during RAG process:", error);
      // Continue without RAG if an error occurs
    }
  }

  const response = await fetch("http://localhost:11434/api/generate", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'qwen2:7b-instruct',
      prompt: augmentedPrompt + "\n\n Please answer concisely in 2-3 lines.",
      max_tokens: 100,
      temperature: 0.7,
      top_p: 0.9,
      stop: ['\n'],
      stream: true
    })
  });

  res.setHeader('Content-Type', 'application/json');

  let buffer = '';
  for await (const chunk of response.body) {
    buffer += chunk.toString();
    let lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) {
        try {
          const json = JSON.parse(line);
          res.write(JSON.stringify(json) + '\n');
        } catch (e) {
        }
      }
    }
  }
  res.end();
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

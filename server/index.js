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
      content: String
    }
  ],
  createdAt: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', chatSchema);

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
    chat.messages.push({ role, content });
    await chat.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
  console.log("Received request for chat", req.body.prompt);
  const response = await fetch("http://localhost:11434/api/generate", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'qwen2:7b-instruct',
      prompt: req.body.prompt + "\n\n Please answer concisely in 2-3 lines.",
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

const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const fetch = require('node-fetch');
const axios = require('axios');
const cheerio = require('cheerio');
// const bodyParser = require('body-parser');
const mongoose = require('mongoose');

// app.use(bodyParser.json());
app.use(helmet());
app.use(cors('*'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

mongoose.connect('mongodb+srv://princeark786:Moyr8b1HQgnV4lx9@firstmongodb.prqz8aj.mongodb.net/?retryWrites=true&w=majority&appName=FirstMongoDB', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));
mongoose.set('strictQuery', true);
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

// Function to search Wikipedia
async function searchWikipedia(query) {
  try {
    const response = await axios.get(`https://en.wikipedia.org/w/api.php`, {
      params: {
        action: 'query',
        format: 'json',
        list: 'search',
        srsearch: query,
        srlimit: 1, // Get only the top result
        prop: 'extracts',
        exintro: true,
        explaintext: true,
        redirects: 1,
        origin: '*'
      }
    });

    const searchResults = response.data.query.search;
    if (searchResults.length > 0) {
      const pageTitle = searchResults[0].title;
      const pageResponse = await axios.get(`https://en.wikipedia.org/w/api.php`, {
        params: {
          action: 'query',
          format: 'json',
          titles: pageTitle,
          prop: 'extracts',
          exintro: true,
          explaintext: true,
          redirects: 1,
          origin: '*'
        }
      });
      const pages = pageResponse.data.query.pages;
      const pageId = Object.keys(pages)[0];
      return pages[pageId].extract;
    }
    return null;
  } catch (error) {
    console.error("Error searching Wikipedia:", error);
    return null;
  }
}

// Function to scrape a web page
async function scrapeWebPage(url) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    // Extract text from common content elements, adjust as needed
    const text = $('p, h1, h2, h3, h4, h5, h6, li').text();
    return text.replace(/\s+/g, ' ').trim(); // Normalize whitespace
  } catch (error) {
    console.error("Error scraping web page:", error);
    return null;
  }
}

// Function to search GitHub code
async function searchGitHubCode(query, language) {
  try {
    const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent(query)}+language:${language}&per_page=3`;
    console.log(`Searching GitHub for: ${searchUrl}`);
    const response = await axios.get(searchUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3.text-match+json'
      }
    });

    const items = response.data.items;
    const codeSnippets = [];

    for (const item of items) {
      // Fetch the raw content of the file
      const rawContentUrl = item.url.replace('api.github.com/repos', 'raw.githubusercontent.com').replace('/contents', '');
      const filePath = item.path;
      const repoName = item.repository.full_name;

      try {
        const contentResponse = await axios.get(rawContentUrl);
        codeSnippets.push({
          filePath: filePath,
          repoName: repoName,
          content: contentResponse.data
        });
      } catch (contentError) {
        console.error(`Error fetching raw content for ${item.path}:`, contentError.message);
      }
    }
    return codeSnippets;
  } catch (error) {
    console.error("Error searching GitHub code:", error.message);
    if (error.response && error.response.status === 403) {
      console.error("GitHub API Rate Limit Exceeded. Please wait or use a Personal Access Token.");
    }
    return null;
  }
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
  let externalContext = '';

  // Step 1: RAG from chat history
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

          if (relevantMessages.length > 0 && relevantMessages[0].similarity > 0.7) { // Threshold for relevance
            console.log("Relevant messages from chat history for RAG:", relevantMessages);
            externalContext += relevantMessages.map(rm => `User previously said: "${rm.message}"`).join('\n');
          }
        }
      }
    } catch (error) {
      console.error("Error during chat history RAG process:", error);
    }
  }

  // Step 2: RAG from Wikipedia (if no strong chat history context or if prompt suggests external knowledge)
  // Simple heuristic: if the prompt contains "who is", "what is", "tell me about", or if externalContext is empty
  const needsExternalSearch = externalContext.length === 0 ||
                              /(who is|what is|tell me about)/i.test(prompt);

  if (needsExternalSearch) {
    try {
      console.log("Attempting Wikipedia search for:", prompt);
      const wikipediaContent = await searchWikipedia(prompt);
      if (wikipediaContent) {
        console.log("Wikipedia content retrieved.");
        externalContext += (externalContext.length > 0 ? '\n\n' : '') + `Wikipedia information: ${wikipediaContent}`;
      } else {
        console.log("No relevant Wikipedia content found.");
      }
    } catch (error) {
      console.error("Error during Wikipedia RAG process:", error);
    }
  }

  // Step 3: RAG from GitHub (for Angular/Node.js specific code)
  const needsCodeSearch = /(how to|example|code for|angular|node\.js|typescript|javascript)/i.test(prompt);

  if (needsCodeSearch) {
    try {
      console.log("Attempting GitHub code search for Angular/Node.js:", prompt);
      const angularCode = await searchGitHubCode(prompt, 'typescript');
      const nodejsCode = await searchGitHubCode(prompt, 'javascript');

      if (angularCode && angularCode.length > 0) {
        console.log("Angular code snippets retrieved.");
        const codeContext = angularCode.map(snippet => `Angular Code from ${snippet.repoName} (${snippet.filePath}):\n\`\`\`typescript\n${snippet.content}\n\`\`\``).join('\n\n');
        externalContext += (externalContext.length > 0 ? '\n\n' : '') + codeContext;
      } else {
        console.log("No relevant Angular code found.");
      }

      if (nodejsCode && nodejsCode.length > 0) {
        console.log("Node.js code snippets retrieved.");
        const codeContext = nodejsCode.map(snippet => `Node.js Code from ${snippet.repoName} (${snippet.filePath}):\n\`\`\`javascript\n${snippet.content}\n\`\`\``).join('\n\n');
        externalContext += (externalContext.length > 0 ? '\n\n' : '') + codeContext;
      } else {
        console.log("No relevant Node.js code found.");
      }

    } catch (error) {
      console.error("Error during GitHub RAG process:", error);
    }
  }

  // Step 4: Construct the final augmented prompt
  if (externalContext.length > 0) {
    augmentedPrompt = `Relevant context:\n${externalContext}\n\nUser query: ${prompt}\n\nPlease answer naturally based on the provided context.`;
    console.log("Augmented prompt with external context:", augmentedPrompt);
  } else {
    console.log("No external context added. Original prompt used.");
  }

  const response = await fetch("http://localhost:11434/api/generate", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'qwen3:4b',
      prompt: augmentedPrompt,
      presence_penalty: 0.6,
      frequency_penalty: 0.6,
      top_k: 50,
      top_p: 0.9,
      n: 1,
      temperature: 0.7,
      max_new_tokens: 500,
      repetition_penalty: 1.1,
      best_of: 1,
      logprobs: 0,
      logit_bias: {},
      seed: null,
      echo: false,
      stop_sequences: [],
      max_tokens: 1000,
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
          console.error('Error parsing Ollama stream chunk:', e);
          // If a chunk is not valid JSON, it might be an error message or malformed data.
          // We should stop processing and end the response to prevent further client-side errors.
          res.end();
          return;
        }
      }
    }
  }
  res.end(); // Ensure response is always ended
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

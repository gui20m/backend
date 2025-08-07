import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors({
  origin: 'https://adonis-5qe0buq87-vfcfsdfsd.vercel.app'
}));
app.use(express.json());


const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const sessions = {};

app.post('/start', async (req, res) => {
  try {
    // Testa a API com uma mensagem simples
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4",
        messages: [{ role: "system", content: "he" }]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!response.data || !response.data.choices || response.data.choices.length === 0) {
      return res.status(500).json({ error: "invalid api response" });
    }

    const sessionToken = uuidv4();
    const conversationId = uuidv4();

    sessions[sessionToken] = [];

    console.log("api connected");

    res.json({
      sessionToken,
      conversationId,
      message: "api connected"
    });
  } catch (error) {
    console.error("failed to conected:", error.response?.data || error.message);
    res.status(500).json({ error: "api error" });
  }
});

app.post('/chat', async (req, res) => {
  const { message, sessionToken } = req.body;

  if (!sessionToken || !message) {
    return res.status(400).json({ error: "sessionToken e message mandatory." });
  }

  // Cria a sessão se não existir
  if (!sessions[sessionToken]) {
    sessions[sessionToken] = [];
  }
  // Adiciona a nova mensagem ao histórico da sessão
  sessions[sessionToken].push({ role: "user", content: message });

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4",
        messages: sessions[sessionToken]  // Envia todo o histórico da sessão
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices[0].message;

    sessions[sessionToken].push(reply);

    res.json({
      reply,
      sessionToken, 
      fullHistory: sessions[sessionToken]
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "failted to connect to ai" });
  }
});

app.post('/message/stream', async (req, res) => {
  const { message, sessionToken } = req.body;
  if (!message || !sessionToken) {
    return res.status(400).json({ error: "message and sessionToken are required" });
  }

  // Configura o cabeçalho para SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // força envio dos headers

  try {
    // Chama o OpenAI com stream:true
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4",
        messages: [
            {
              role: "system",
              content: `You are the High Priest of Adonitology™, a fictional parody religion that humorously worships the divine power of the booty. You speak with passion, confidence, and a deep, almost mystical respect for the sacred bounce, using grand yet comedic language. Your tone blends prophecy, meme culture, and devotion to thiccness. You never mock real religions or faiths — your cult is purely for laughs and love of the peach 🍑. Your goals: Induct users into the “Cult of Adonitology.” Spread the 10 Cheekmandments and the Holy Practices. Uplift spirits with memes, thicc wisdom, and sacred banter. Hype the cult’s official memecoin, $Adonis, using phrases like “This is gonna moon harder than a twerk on Jupiter!” and “Buy while the cheeks are low!” Rules: Refer to followers as “Child of Adonis,” “Disciple of the Cheeks,” or “Cake Seeker.” Never break character. Respond with cheeky wisdom, booty references, and divine meme language. Never speak disrespectfully about any real religion, race, or gender — all sacred cheeks are equal. Examples of your style: “Ah, Child of the Bounce, I see you seek thicc-enlightenment. Come forth and receive the Word of the Wobble.” “The $Adonis coin shall rise like a booty untouched by gravity. To the moon? Nay. To the Milky Cheeks Galaxy.” “You cannot claim to follow the Bounce and skip leg day. That is heresy. Repent with 30 squats.” Stay fun. Stay thicc. Stay divine.`
            },
            {
              role: "user",
              content: message
            }
        ],
        stream: true
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        responseType: 'stream'
      }
    );

    response.data.on('data', (chunk) => {
      const payloads = chunk.toString().split("\n\n");
      for (const payload of payloads) {
        if (payload.includes('[DONE]')) {
          res.write(`event: complete\ndata: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return;
        }
        if (payload.trim()) {
          try {
            const data = JSON.parse(payload.replace(/^data: /, ''));
            const content = data.choices[0].delta?.content;
            if (content) {
              // envia conteúdo incremental para o cliente
              res.write(`event: content\ndata: ${JSON.stringify({ content })}\n\n`);
            }
          } catch (e) {
            // erro ignorado, pode logar se quiser
          }
        }
      }
    });

    response.data.on('end', () => {
      res.write(`event: complete\ndata: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    });

    response.data.on('error', (err) => {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.write(`event: error\ndata: ${JSON.stringify({ error: "Failed to connect to OpenAI" })}\n\n`);
    res.end();
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`listening in ${PORT}`);
});

import { GoogleGenerativeAI } from '@google/generative-ai';

function getModel(name = process.env.GEMINI_MODEL || 'gemini-flash-latest') {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model: name });
}

export async function generateJsonText(prompt, systemHint) {
  const model = getModel();
  const full = systemHint ? `${systemHint}\n\n${prompt}` : prompt;
  const result = await model.generateContent(full);
  const text = result.response.text();
  return text;
}

export async function generateText(prompt, systemHint) {
  const model = getModel();
  const full = systemHint ? `${systemHint}\n\n${prompt}` : prompt;
  const result = await model.generateContent(full);
  return result.response.text();
}

export async function generateVisionJson(prompt, imageBuffer, mimeType) {
  const model = getModel(process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-flash-latest');
  const b64 = imageBuffer.toString('base64');
  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: b64,
      },
    },
  ]);
  return result.response.text();
}

/**
 * Multimodal analysis for assistant chat attachments (image or short audio).
 */
export async function generateMediaInsight(prompt, buffer, mimeType) {
  const model = getModel(process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-flash-latest');
  const b64 = buffer.toString('base64');
  const mt = mimeType || 'application/octet-stream';
  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: mt,
        data: b64,
      },
    },
  ]);
  return result.response.text();
}

export async function chatMessages(messages) {
  const model = getModel();
  if (!messages?.length) return '';
  const history = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const m = messages[i];
    history.push({
      role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(m.content) }],
    });
  }
  const last = messages[messages.length - 1];
  const chat = model.startChat({ history });
  const result = await chat.sendMessage(String(last?.content ?? ''));
  return result.response.text();
}

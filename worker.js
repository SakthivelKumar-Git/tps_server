import { httpServerHandler } from 'cloudflare:node';
import app from './app.js';
import { connectDB } from './config/db.js';

// Internal port for Express to listen on inside the Worker isolate
const PORT = 8080;
app.listen(PORT);

let dbInitPromise = null;
const initDatabase = (env) => {
  if (!dbInitPromise) {
    if (env) {
      if (env.MONGODB_URI) process.env.MONGODB_URI = env.MONGODB_URI;
      if (env.JWT_SECRET) process.env.JWT_SECRET = env.JWT_SECRET;
      if (env.ADMIN_EMAIL) process.env.ADMIN_EMAIL = env.ADMIN_EMAIL;
      if (env.ADMIN_PASSWORD) process.env.ADMIN_PASSWORD = env.ADMIN_PASSWORD;
      if (env.ADMIN_NAME) process.env.ADMIN_NAME = env.ADMIN_NAME;
      if (env.CLIENT_URL) process.env.CLIENT_URL = env.CLIENT_URL;
    }
    dbInitPromise = connectDB().catch((err) => {
      console.warn('Database initialization warning:', err.message);
    });
  }
  return dbInitPromise;
};

const nodeHandler = httpServerHandler({ port: PORT });

export default {
  async fetch(request, env, ctx) {
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(initDatabase(env));
    } else {
      await initDatabase(env);
    }
    return nodeHandler.fetch(request, env, ctx);
  }
};

import mongoose from 'mongoose';
import { config } from './index';
import { MongoMemoryServer } from 'mongodb-memory-server';
import path from 'path';
import fs from 'fs';

let isShuttingDown = false;
let mongoMemoryServer: MongoMemoryServer | null = null;

export const connectDB = async (): Promise<void> => {
  // Disable Mongoose query buffering to fail fast instead of hanging when DB goes offline
  mongoose.set('bufferCommands', false);
  const mongoURI = config.MONGODB_URI;
  const maxRetries = 5;
  let retryDelay = 2000;

  mongoose.connection.on('connected', () => {
    console.log('[Database] MongoDB Connected Successfully.');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[Database] MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    if (!isShuttingDown) {
      console.warn('[Database] MongoDB disconnected! Reconnecting automatically...');
    }
  });

  // Spin up a persistent local MongoDB in dev if no external MongoDB is running on port 27017
  if (config.NODE_ENV !== 'production' && (mongoURI.includes('127.0.0.1:27017') || mongoURI.includes('localhost:27017'))) {
    try {
      const dbPath = path.resolve(__dirname, '../../../.mongodb_data');
      console.log(`[Database] Starting persistent local MongoDB server on port 27017 at path: ${dbPath}`);
      
      if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
      }

      mongoMemoryServer = await MongoMemoryServer.create({
        instance: {
          port: 27017,
          ip: '127.0.0.1',
          dbName: 'cloud-ide',
          dbPath,
          storageEngine: 'wiredTiger',
        }
      });
      console.log('[Database] Persistent local MongoDB server started successfully.');
    } catch (err) {
      console.log('[Database] Failed to start local MongoDB (possibly already running or port in use):', err);
    }
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (isShuttingDown) return;

      // Start local MongoDB if it hasn't been started yet (prevents ts-node-dev race conditions)
      if (config.NODE_ENV !== 'production' && 
          (mongoURI.includes('127.0.0.1:27017') || mongoURI.includes('localhost:27017')) && 
          !mongoMemoryServer) {
        try {
          const dbPath = path.resolve(__dirname, '../../../.mongodb_data');
          if (!fs.existsSync(dbPath)) {
            fs.mkdirSync(dbPath, { recursive: true });
          }

          mongoMemoryServer = await MongoMemoryServer.create({
            instance: {
              port: 27017,
              ip: '127.0.0.1',
              dbName: 'cloud-ide',
              dbPath,
              storageEngine: 'wiredTiger',
            }
          });
          console.log('[Database] Persistent local MongoDB server started in connection loop.');
        } catch (err) {
          // Ignore, might be starting/releasing port
        }
      }

      console.log(`[Database] Connecting to MongoDB (Attempt ${attempt}/${maxRetries})...`);
      await mongoose.connect(mongoURI);
      return;
    } catch (error) {
      console.error(`[Database] Connection attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        console.error('[Database] Max database connection retries reached. Exiting.');
        process.exit(1);
      }
      console.log(`[Database] Retrying in ${retryDelay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay *= 2;
    }
  }
};

export const disconnectDB = async (): Promise<void> => {
  isShuttingDown = true;
  console.log('[Database] Disconnecting Mongoose connection gracefully...');
  try {
    await mongoose.connection.close();
    console.log('[Database] Mongoose connection closed.');
  } catch (err) {
    console.error('[Database] Error while closing Mongoose connection:', err);
  }

  // Under ts-node-dev respawn, keep the database process alive to prevent race conditions where
  // the old process stops the database after the new process has already connected to it.
  if (mongoMemoryServer && !process.env.TS_NODE_DEV) {
    console.log('[Database] Stopping in-memory MongoDB server...');
    try {
      await mongoMemoryServer.stop();
      console.log('[Database] In-memory MongoDB server stopped.');
    } catch (err) {
      console.error('[Database] Error while stopping in-memory MongoDB server:', err);
    }
  } else if (mongoMemoryServer) {
    console.log('[Database] Skipping in-memory MongoDB server teardown (ts-node-dev reload active).');
  }
};

// Graceful shutdown hooks
const handleShutdown = async (signal: string) => {
  console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);
  if (mongoMemoryServer) {
    try {
      await mongoMemoryServer.stop();
    } catch (e) {}
  }
  await disconnectDB();
  process.exit(0);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));


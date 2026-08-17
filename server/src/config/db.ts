import mongoose from 'mongoose';

export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cloud-ide';
    console.log(`[Database] Connecting to MongoDB at ${mongoURI}...`);
    
    await mongoose.connect(mongoURI);
    
    console.log('[Database] MongoDB Connected Successfully.');
  } catch (error) {
    console.error('[Database] MongoDB Connection Error:', error);
    process.exit(1);
  }
};

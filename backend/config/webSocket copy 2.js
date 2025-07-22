
// config/db.js - Optimized for DigitalOcean Droplet (2vCPU, 16GB RAM, MongoDB Replica Set)

import mongoose from 'mongoose';



const connectDB = async () => {

    try {

        console.log('🔗 Connecting to MongoDB replica set...');

        // ✅ FIXED: Added &directConnection=true to the end of the URI

        const MONGODB_URI ='mongodb://mongoadmin:your_super_secret_password@mongodb:27017/test?replicaSet=rs0&authSource=admin&directConnection=true'

        

        const conn = await mongoose.connect(MONGODB_URI, {

            maxPoolSize: 8,

            minPoolSize: 2,

            maxIdleTimeMS: 30000,

            serverSelectionTimeoutMS: 5000,

            socketTimeoutMS: 20000,

            connectTimeoutMS: 5000,

            readPreference: 'primary',

            readConcern: { level: 'majority' },

            writeConcern: { 

                w: 'majority',

                j: true

            },

            retryWrites: true,

            retryReads: true,

            heartbeatFrequencyMS: 5000,

            compressors: ['zlib'],

        });

        

        console.log(`✅ MongoDB Connected: ${conn.connection.host}:${conn.connection.port}`);

        console.log(`📊 Database: ${conn.connection.name}`);

        console.log(`🔄 Replica Set: rs0`);

        

        mongoose.set('strictQuery', false);



        mongoose.connection.on('error', (err) => {

            console.error('❌ MongoDB connection error:', err.message);

        });

        

        mongoose.connection.on('disconnected', () => {

            console.log('⚠️  MongoDB disconnected - attempting reconnection...');

        });

        

        mongoose.connection.on('reconnected', () => {

            console.log('✅ MongoDB reconnected');

        });



    } catch (error) {

        console.error(`❌ MongoDB Connection Failed: ${error.message}`);

        process.exit(1);

    }

};



export default connectDB;
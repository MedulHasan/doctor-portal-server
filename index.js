const express = require('express');
const cors = require('cors');
const admin = require("firebase-admin");
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
// payment
const stripe = require('stripe')('sk_test_51JvuqtDIBQXTyseW7lEWVGtdyPfwofGJTVbLHf0dSEruPjvlCeKHyQ2jpRVcEoyPyU6eQJIQ3nJnIKh9igMKSe1v00WlDKbXqV')
// payment
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8888;

app.use(cors());
app.use(express.json());


const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

async function verifyToken(req, res, next) {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers?.authorization?.split(' ')[1];

        try {
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email
        }
        catch {

        }
    }
    next();
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.y6hb5.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function run() {
    try {
        await client.connect();
        console.log('Database connected');
        const database = client.db('doctor_portal');
        const appointmentCollection = database.collection('appointment');
        const usersCollection = database.collection('users');

        // payment
        app.post('/create-payment-intent', async (req, res) => {
            const paymentInfo = req.body;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: paymentInfo.price * 100,
                payment_method_types: ['card']
            });
            res.json({clientSecret: paymentIntent.client_secret})
        });

        // appointment payment save to db
        app.put('/appointment/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const query = {_id: ObjectId(id)}
            const updateDoc = {
                $set: {
                    payment: payment
                }
            };
            const result = await appointmentCollection.updateOne(query, updateDoc);
            res.json(result);
        })
        // payment

        app.get('/appointment', verifyToken, async (req, res) => {
            const email = req.query.email;
        const date = req.query.date;
            const query = { email: email, date: date };
            const appointments = appointmentCollection.find(query);
            const result = await appointments.toArray();
            res.json(result);
        });

        app.get('/appointment/:appointmentId', async (req, res) => {
            const appointmentId = req.params.appointmentId;
            const query = {_id: ObjectId(appointmentId)};
            const result = await appointmentCollection.findOne(query);
            res.json(result);
        })

        app.post('/appointment', async (req, res) => {
            const data = req.body;
            const result = await appointmentCollection.insertOne(data);
            res.json(result);
        });

        app.post('/users', async (req, res) => {
            const data = req.body;
            const result = await usersCollection.insertOne(data);
            res.json(result);
        });

        app.put('/users', async (req, res) => {
            const data = req.body;
            const filter = { email: data.email };
            const options = { upsert: true };
            const updateDoc = {
                $set: data
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result);
        });

        app.put('/users/admin', verifyToken, async (req, res) => {
            const data = req.body;
            const requester = req.decodedEmail;
            if (requester) {
                const isRequesterIsAdmin = await usersCollection.findOne({ email: requester })
                if (isRequesterIsAdmin?.role === 'admin') {
                    const filter = { email: data.adminEmail };
                    const updateDoc = {
                        $set: { role: 'admin' }
                    };
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result)
                }
            } else {
                res.status(403).json({ message: 'You dont have an access to make admin' })
            }
        });

        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await usersCollection.findOne(query);
            let isAdmin = false;
            if (result?.role === 'admin') {
                isAdmin = true;
            }
            res.json({ admin: isAdmin })
        })
    }
    finally {
        // await client.close()
    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello Doctor portal')
})

app.listen(port, () => {
    console.log('Server is running on port ', port);
})
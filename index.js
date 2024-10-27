const express = require('express')
const app = express()
const port = process.env.PORT || 5000;
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
// Initialize Firebase Admin with environment variable JSON
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS)),
});

// middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.t79plj2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,    
    }
});


async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        client.connect();
        // Send a ping to confirm a successful connection
        const templatesCollection = client.db('greenforms').collection('templates');
        const usersCollection = client.db('greenforms').collection('users');
        const registeredCollection = client.db('greenforms').collection('registereduser');

        // Like a template
        app.post('/api/like', async (req, res) => {
            const { templateId, email } = req.body;

            try {
                // Find if the user has already liked the template
                const user = await usersCollection.findOne({ email });
                if (user && user.likedTemplates.includes(templateId)) {
                    return res.status(400).json({ message: 'Template already liked' });
                }

                // Add template to user's liked templates
                await usersCollection.updateOne(
                    { email },
                    { $addToSet: { likedTemplates: templateId } },
                    { upsert: true }
                );

                // Increment the like count for the template
                await templatesCollection.updateOne(
                    { templateId },
                    { $inc: { likeCount: 1 } },
                    { upsert: true }
                );

                res.status(200).json({ message: 'Template liked successfully' });
            } catch (error) {
                res.status(500).json({ message: 'Error liking the template', error });
            }
        });

        // Unlike a template
        app.post('/api/unlike', async (req, res) => {
            const { templateId, email } = req.body;

            try {
                // Find if the user has liked the template
                const user = await usersCollection.findOne({ email });
                if (!user || !user.likedTemplates.includes(templateId)) {
                    return res.status(400).json({ message: 'Template not liked yet' });
                }

                // Remove template from user's liked templates
                await usersCollection.updateOne(
                    { email },
                    { $pull: { likedTemplates: templateId } }
                );

                // Decrement the like count for the template
                await templatesCollection.updateOne(
                    { templateId },
                    { $inc: { likeCount: -1 } }
                );

                res.status(200).json({ message: 'Template unliked successfully' });
            } catch (error) {
                res.status(500).json({ message: 'Error unliking the template', error });
            }
        });

        app.get('/api/like-status/:email', async (req, res) => {
            const likedTemplates = req.params.email;
            const templates = await usersCollection.find({ email: likedTemplates }).toArray();
            res.send(templates);
        });

        app.get('/template/like/:templateId', async (req, res) => {
            const liked = req.params.templateId;
            const templates = await templatesCollection.find({ templateId: liked }).toArray();
            res.send(templates);
        });




        // For posting info of registered users
        app.post('/registereduser', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await registeredCollection.findOne(query);

            if (existingUser) return res.send({ message: 'user already exists' })

            const result = await registeredCollection.insertOne(user);
            res.send(result);
        })

        //registered collection
        app.get('/registereduser', async (req, res) => {
            const cursor = registeredCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });

        app.put('/registereduser/:id', async (req, res) => {
            const id = req.params.id;
            const classes = req.body;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updatedUser = {
                $set: {
                    role: classes.value,
                }
            }
            const result = await registeredCollection.updateOne(filter, updatedUser, options);
            res.send(result);
        })


        // API to get a specific user by email
        app.get('/registereduser/:email', async (req, res) => {
            const email = req.params.email;
            const user = await registeredCollection.findOne({ email: email });
            res.send(user);
        });


        // API to delete a user (both in MongoDB and Firebase)
        app.delete('/registereduser/:email', async (req, res) => {
            const email = req.params.email;

            try {
                const firebaseUser = await admin.auth().getUserByEmail(email);
                await admin.auth().deleteUser(firebaseUser.uid);

                const result = await registeredCollection.deleteOne({ email: email });
                if (result.deletedCount > 0) {
                    res.status(200).json({ message: 'User deleted successfully' });
                } else {
                    res.status(404).json({ message: 'User not found' });
                }
            } catch (error) {
                console.error('Error deleting user:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });




        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        //await client.close();
    }
}
run().catch(console.dir);
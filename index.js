require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const admin = require('firebase-admin')
const port = process.env.PORT || 3000
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString(
  'utf-8'
)
const serviceAccount = JSON.parse(decoded)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const app = express()
// middleware
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://b12-m11-session.web.app',
    ],
    credentials: true,
    optionSuccessStatus: 200,
  })
)
app.use(express.json())

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1]
  console.log(token)

  if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.tokenEmail = decoded.email
    console.log(decoded)
    next()
  } catch (err) {
    console.log(err)
    return res.status(401).send({ message: 'Unauthorized Access!', err })
  }
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {
         const db = client.db('clubspheredb')
         const clubsCollection = db.collection('clubs')
         const eventRegistrationsCollection = db.collection('eventRegistrations')
         const eventsCollection = db.collection('events')
         const membershipsCollection = db.collection('memberships')
         const paymentsCollection = db.collection('payments')
         const usersCollection = db.collection('users')


        //  clubs
         app.get("/clubs", async (req, res) => {
  const query = {};
  if (req.query.status) query.status = req.query.status;

  const result = await clubsCollection.find(query).toArray();
  res.send(result);
});

// featuredClubs
         app.get("/featuredClubs",  async (req, res) => {
           try{
                  const clubs = await clubsCollection.find().limit(8).sort({
membershipFee: -1}).toArray()
                  res.send(clubs);
                }catch(error) {
                   res.status(500).send({message: "Filed to fetch clubs", error});
                }
               })

// clubDetails
              app.get("/clubs/:id",  async (req, res) => {
                      try{
                          const id = req.params.id;

                           if(!ObjectId.isValid(id)){
                    return res.status(400).send({message: "Invalid Club ID"})
                  }

                  const club = await clubsCollection.findOne({_id: new ObjectId(id)})

                  if(!club){
                    return res.status(404).send({message: "Club not found"})
                  }

                  res.send(club)
                }catch(error) {
                   res.status(500).send({message: "Filed to fetch clubs", error});
                }
               })

              //create clubs
              app.post("/clubs", async (req, res) => {
  try {
    const data = req.body;
    data.status = "pending";
    data.createdAt = new Date();
    data.updatedAt = new Date();

    const result = await clubsCollection.insertOne(data);
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

         // user save
         app.post("/users", async (req, res) => {
          const user = req.body;
       // email exist
          const exist = await usersCollection.findOne({email: user.email});
          if(exist){
            return res.send({message: "User already exists", inserted: false});
          }
            user.role = "member";
            user.createdAt = new Date();
            
            const result = await usersCollection.insertOne(user);
            res.send(result);

         })

       // get All user (admin)
       app.get("/users", verifyJWT, async (req, res) =>{
        const result = await usersCollection.find().toArray();
        res.send(result)
       });
       // get All clubs (admin)
       app.get("/clubs", verifyJWT, async (req, res) =>{
        const result = await clubsCollection.find().toArray();
        res.send(result)
       });
// status approve of clubs
       app.patch("/clubs/approve/:id", async (req, res) => {
  const id = req.params.id;
  const result = await clubsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "approved", updatedAt: new Date() } }
  );
  res.send(result);
});
// status reject of clubs
       app.patch("/clubs/reject/:id", async (req, res) => {
  const id = req.params.id;
  const result = await clubsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "reject", updatedAt: new Date() } }
  );
  res.send(result);
});

       // Get user role by email
        app.get("/users/role/:email", verifyJWT, async (req, res) => {
         const email = req.params.email;
         const user = await usersCollection.findOne({ email });
       
         if (!user) return res.status(404).send({ message: "User not found" });

      res.send({ role: user.role });
        });

 //user Update (admin)
         app.patch("/users/role/:email", verifyJWT, async (req, res)=>{
          const email = req.params.email;
             const {role} = req.body;
            
         try {
    const result = await usersCollection.updateOne(
      { email: email },
      { $set: { role: role } }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to update role", error });
  }  
  });

app.get('/users/:email', verifyJWT, async (req, res) => {
    const email = req.params.email;

    try {
        const user = await usersCollection.findOne({ email });

        if (!user) {
            return res.status(404).send({ message: "User not found" });
        }

        res.send(user);

    } catch (error) {
        res.status(500).send({ message: "Server Error", error });
    }
});

//get all clubs
app.get("/admin/clubs", async (req, res) => {
  try {
    const clubs = await clubsCollection.find().toArray();
    res.send(clubs);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

//approve a club
app.patch("/admin/clubs/approve/:id", async (req, res) => {
  const id = req.params.id;

  const result = await clubsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "approved", updatedAt: new Date() } }
  );

  res.send(result);
});

//reject a club
app.patch("/admin/clubs/reject/:id", async (req, res) => {
  const id = req.params.id;

  const result = await clubsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "rejected", updatedAt: new Date() } }
  );

  res.send(result);
});


// POST /memberships - user joins a club
app.post("/memberships", async (req, res) => {
  try {
    const { userEmail, clubName, status, paymentId, joinedAt, expiresAt } = req.body;

    if (!userEmail || !clubName || !status) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const newMembership = {
      userEmail,
      clubId: clubName,         // store name instead of ObjectId
      status,
      paymentId: paymentId || null,
      joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null
    };

    const result = await membershipsCollection.insertOne(newMembership);

    res.status(201).json({ success: true, membershipId: result.insertedId, data: newMembership });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// Example GET memberships by user
app.get("/memberships", async (req, res) => {
  const { userEmail } = req.query;
  const memberships = await membershipsCollection.find({ userEmail }).toArray();
  res.send(memberships);
});


















































































    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from Server..')
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})

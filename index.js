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
           try{
                  const clubs = await clubsCollection.find().toArray()
                  res.send(clubs);


                }catch(error) {
                   res.status(500).send({message: "Filed to fetch clubs", error});
                }
               })
// featuredClubs
         app.get("/featuredClubs", async (req, res) => {
           try{
                  const clubs = await clubsCollection.find().limit(8).sort({
membershipFee: -1}).toArray()
                  res.send(clubs);
                }catch(error) {
                   res.status(500).send({message: "Filed to fetch clubs", error});
                }
               })

// clubDetails
              app.get("/clubs/:id", async (req, res) => {
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
       app.get("/users", async (req, res) =>{
        const result = await usersCollection.find().toArray();
        res.send(result)
       });

       // get single user by email
       app.get("users/role/:email", async (req, res) =>{
        const email = req.params.email;
        const result= await usersCollection.findOne({email})
        res.send(result)
       })

 //user Update (admin)
         app.patch("users/role/:email", async (req, res)=>{
          const email = req.params.email;
             const {role} = req.body;
            
        const result = await usersCollection.updateOne(
          {email},
          {$set: {role}}
        )
        res.send(result)
         })  























































































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

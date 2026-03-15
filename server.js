import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/lead", async (req, res) => {

  console.log("Webhook received from Vapi")

  const data = req.body

  if (!data?.message?.artifact) {
    console.log("No artifact found")
    return res.sendStatus(200)
  }

  const transcript = data.message.artifact.transcript

  console.log("Call transcript:")
  console.log(transcript)

  res.sendStatus(200)

})

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/lead", async (req, res) => {

  try {

    console.log("Webhook received from Vapi");

    const data = req.body;

    const outputs = data?.message?.artifact?.structuredOutputs;

    if (!outputs) {
      console.log("No structured output yet");
      return res.sendStatus(200);
    }

    const lead = Object.values(outputs)[0]?.result;

    if (!lead) {
      console.log("Lead schema not completed yet");
      return res.sendStatus(200);
    }

    console.log("Lead captured:");
    console.log(lead);

    const leadText = `
First Name: ${lead.firstName}
Last Name: ${lead.lastName}
Email: ${lead.email}
Phone: ${lead.phone}
Service Needed: ${lead.serviceNeeded}
Tell us more: ${lead.tellUsMore || ""}
Street Address: ${lead.streetAddress}
City: ${lead.city}
State: ${lead.state}
Zip: ${lead.zip}
Best Day for a visit: ${lead.bestDayForVisit}
`;

    await openai.responses.create({
      model: "gpt-4.1",
      workflow: "Green Machines Form Agent",
      input: {
        input_as_text: leadText
      }
    });

    console.log("Workflow triggered");

    res.sendStatus(200);

  } catch (error) {

    console.error("Error:", error);
    res.sendStatus(500);

  }

});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

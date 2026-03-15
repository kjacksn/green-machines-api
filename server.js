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

    // show the full payload in Railway logs
    console.log(JSON.stringify(req.body, null, 2));

    // extract the structured lead data
    const lead =
      req.body.message.artifact.structuredOutputs["Green Machines Lead Intake"].result;

    console.log("Extracted Lead:", lead);

    const prompt = `
Submit this lead to the Green Machines Lawn Care work request form.

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

Open https://www.greenmachineslawncare.com/#GetaFreeQuote
Fill the form and submit it.
`;

    await openai.responses.create({
      model: "gpt-4.1",
      input: prompt
    });

    res.status(200).send("ok");

  } catch (error) {

    console.error("Error processing lead:", error);

    res.status(500).send("error");

  }

});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
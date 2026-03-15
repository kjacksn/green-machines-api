app.post("/lead", async (req, res) => {

  try {

    console.log("Webhook received from Vapi");

    const data = req.body;

    console.log("FULL PAYLOAD:");
    console.log(JSON.stringify(data, null, 2));

    const transcript = data?.message?.artifact?.transcript;

    if (!transcript) {
      console.log("Transcript not ready yet");
      return res.sendStatus(200);
    }

    console.log("Transcript received:");
    console.log(transcript);

    await openai.responses.create({
      model: "gpt-4.1",
      input: `
A phone call transcript for a lawn care lead is below.

Extract the customer details from this call and prepare them for a lawn care work request form.

Transcript:
${transcript}
`
    });

    console.log("OpenAI API called successfully");

    res.sendStatus(200);

  } catch (error) {

    console.error("SERVER ERROR:");
    console.error(error);

    res.sendStatus(500);

  }

});

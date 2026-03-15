app.post("/lead", async (req, res) => {

  try {

    console.log("Webhook received from Vapi")

    const data = req.body

    const outputs = data?.message?.artifact?.structuredOutputs

    if (!outputs) {
      console.log("No structured output yet")
      return res.sendStatus(200)
    }

    const lead = outputs["Green Machines Lead Intake"]?.result

    if (!lead) {
      console.log("Lead schema not completed yet")
      return res.sendStatus(200)
    }

    console.log("Lead captured:")
    console.log(lead)

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
`

    await openai.responses.create({
      model: "gpt-4.1",
      input: prompt
    })

    res.sendStatus(200)

  } catch (error) {

    console.error("Error:", error)
    res.sendStatus(500)

  }

})
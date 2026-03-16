import express from "express";
import fetch from "node-fetch";
import FormData from "form-data";

const app = express();
app.use(express.json());

/* Convert "Tuesday, March 17, 2026"
   → "Mar 17, 2026" (format LawnPro expects) */

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

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

    if (!lead.leadComplete) {
      console.log("Lead not finished yet");
      return res.sendStatus(200);
    }

    console.log("Lead captured:");
    console.log(lead);

    /* Build LawnPro form submission */

    const form = new FormData();

    form.append("first_name", lead.firstName);
    form.append("last_name", lead.lastName);
    form.append("email", lead.email);
    form.append("phone", lead.phone);
    form.append("company_name", "");
    form.append("request_for", lead.serviceNeeded);
    form.append("request_details", lead.tellUsMore || "");
    form.append("request_frequency", "One time");
    form.append("addr_1", lead.streetAddress);
    form.append("addr_2", "");
    form.append("city", lead.city);
    form.append("state", lead.state);
    form.append("zip", lead.zip);
    form.append("appointment_date_1", formatDate(lead.bestDayForVisit));
    form.append("appointment_times[]", "Any time");

    /* Some LawnPro installs allow blank captcha */
    form.append("gRecaptchaResponse", "");

    const response = await fetch(
      "https://secure.lawnprosoftware.com/client/guest/requests/save/549b4d30-D2eb-4df5-B6a1-3d0ddbb5dc8f",
      {
        method: "POST",
        body: form
      }
    );

    console.log("LawnPro submission status:", response.status);

    res.sendStatus(200);

  } catch (error) {

    console.error("Error:", error);
    res.sendStatus(500);

  }

});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

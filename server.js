import express from "express";
import fetch from "node-fetch";
import FormData from "form-data";

const app = express();
app.use(express.json());

const COMPANY_ID = "549b4d30-D2eb-4df5-B6a1-3d0ddbb5dc8f";

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

    console.log("Lead captured:", lead);

    /* ------------------------------
       STEP 1: LOAD WIDGET SCRIPT
    ------------------------------ */

    const script = await fetch(
      "https://secure.lawnprosoftware.com/widget/lp-requests_access_grant_0x.js"
    );

    const scriptText = await script.text();

    const grantMatch = scriptText.match(/access_grant\s*=\s*"([^"]+)"/);

    const accessGrant = grantMatch ? grantMatch[1] : "0x";

    console.log("Access grant:", accessGrant);

    /* ------------------------------
       STEP 2: BUILD FORM
    ------------------------------ */

    const form = new FormData();

    form.append("first_name", lead.firstName);
    form.append("last_name", lead.lastName);
    form.append("email", lead.email);
    form.append("phone", lead.phone);
    form.append("company_name", "");

    form.append("request_for", lead.serviceNeeded);

    const details =
      lead.tellUsMore && lead.tellUsMore !== "null"
        ? lead.tellUsMore
        : "";

    form.append("request_details", details);

    form.append("request_frequency", "One time");

    form.append("addr_1", lead.streetAddress);
    form.append("addr_2", "");
    form.append("city", lead.city);
    form.append("state", lead.state);
    form.append("zip", lead.zip);

    form.append("appointment_date_1", formatDate(lead.bestDayForVisit));
    form.append("appointment_times[]", "Any time");

    form.append("gRecaptchaResponse", "");

    /* required LawnPro widget values */

    form.append("access_grant", accessGrant);
    form.append("request_company_id", COMPANY_ID);

    /* ------------------------------
       STEP 3: SUBMIT
    ------------------------------ */

    const response = await fetch(
      `https://secure.lawnprosoftware.com/client/guest/requests/save/${COMPANY_ID}`,
      {
        method: "POST",
        body: form,
        headers: {
          ...form.getHeaders(),
          "Origin": "https://secure.lawnprosoftware.com",
          "Referer": `https://secure.lawnprosoftware.com/client/guest/requests/embedNew/${COMPANY_ID}`,
          "User-Agent": "Mozilla/5.0"
        }
      }
    );

    const responseText = await response.text();

    console.log("LawnPro submission status:", response.status);
    console.log("LawnPro response:", responseText);

    res.sendStatus(200);

  } catch (error) {

    console.error("Error:", error);
    res.sendStatus(500);

  }

});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

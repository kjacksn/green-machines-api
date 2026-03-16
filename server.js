import express from "express";
import fetch from "node-fetch";
import FormData from "form-data";

const app = express();
app.use(express.json());

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

    /* ------------------------------
       STEP 1: LOAD EMBED PAGE
    ------------------------------ */

    const session = await fetch(
      "https://secure.lawnprosoftware.com/client/guest/requests/embedNew/549b4d30-D2eb-4df5-B6a1-3d0ddbb5dc8f",
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Accept": "text/html",
          "Accept-Language": "en-US,en;q=0.9"
        }
      }
    );

    const rawCookie = session.headers.get("set-cookie");
    const cookie = rawCookie ? rawCookie.split(";")[0] : "";

    console.log("Session cookie obtained:", cookie);

    const html = await session.text();

    /* ------------------------------
       STEP 2: EXTRACT ALL HIDDEN FIELDS
    ------------------------------ */

    const hiddenInputs = [...html.matchAll(/<input[^>]+type="hidden"[^>]*>/g)];

    const hiddenFields = {};

    hiddenInputs.forEach(input => {

      const nameMatch = input[0].match(/name="([^"]+)"/);
      const valueMatch = input[0].match(/value="([^"]*)"/);

      if (nameMatch && valueMatch) {
        hiddenFields[nameMatch[1]] = valueMatch[1];
      }

    });

    console.log("Hidden fields found:", hiddenFields);

    /* ------------------------------
       STEP 3: BUILD FORM
    ------------------------------ */

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

    form.append("gRecaptchaResponse", "");

    /* append hidden fields */

    Object.entries(hiddenFields).forEach(([key, value]) => {
      form.append(key, value);
    });

    /* ------------------------------
       STEP 4: SUBMIT FORM
    ------------------------------ */

    const response = await fetch(
      "https://secure.lawnprosoftware.com/client/guest/requests/save/549b4d30-D2eb-4df5-B6a1-3d0ddbb5dc8f",
      {
        method: "POST",
        body: form,
        headers: {
          ...form.getHeaders(),
          "Origin": "https://secure.lawnprosoftware.com",
          "Referer": "https://secure.lawnprosoftware.com/client/guest/requests/embedNew/549b4d30-D2eb-4df5-B6a1-3d0ddbb5dc8f",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Accept": "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Connection": "keep-alive",
          "Cookie": cookie
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

import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
async function sendSMS(lead) {
  try {
    const message = `Hey ${lead.firstName}, this is Mac with Green Machines.

Got your request for ${lead.serviceNeeded} 👍

We’ll take a look at your property and follow up shortly with details.`;

    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      const cleanPhone = lead.phone.replace(/\D/g, "").slice(-10);

await client.messages.create({
  body: message,
  from: process.env.TWILIO_PHONE_NUMBER,
  to: `+1${cleanPhone}`
});

    console.log("SMS sent successfully");
  } catch (error) {
    console.error("SMS failed:", error.message);
  }
}

import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

processedCalls.add(callId);

setTimeout(() => {
  processedCalls.delete(callId);
}, 1000 * 60 * 10); // 10 minutes

/* KEEP BROWSER ALIVE */
let browser;

async function startBrowser() {

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  console.log("Chromium started");

}

async function submitLeadWithPlaywright(lead) {

  const page = await browser.newPage();

  try {

    console.log("Opening website...");

    await page.goto(
      "https://www.greenmachineslawncare.com/#GetaFreeQuote",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    await page.waitForTimeout(4000);

    let frame = page.frames().find(f =>
      f.url().includes("lawnprosoftware.com")
    );

    if (!frame) {
      frame = page.mainFrame();
    }

    await frame.waitForSelector('input[name="first_name"]');

    /* STEP 1 */

    console.log("Filling step 1");

    await frame.locator('input[name="first_name"]').fill(lead.firstName);
    await frame.locator('input[name="last_name"]').fill(lead.lastName);
    await frame.locator('input[name="email"]').fill(lead.email);
    await frame.locator('input[name="phone"]').fill(lead.phone);

    await frame.locator('button.lh-btn-next:visible').click();

    await page.waitForTimeout(1500);

    /* STEP 2 */

    console.log("Filling step 2");

    await frame.locator(`label:has(input[value="${lead.serviceNeeded}"])`).click();

    await frame.locator('[name="request_details"]').fill(
      lead.tellUsMore || ""
    );

    await frame.locator('button.lh-btn-next:visible').click();

    await page.waitForTimeout(1500);

    /* STEP 3 */

    console.log("Filling step 3");

    await frame.locator('input[name="addr_1"]').fill(lead.streetAddress);
    await frame.locator('input[name="city"]').fill(lead.city);
    await frame.locator('input[name="state"]').fill(lead.state);
    await frame.locator('input[name="zip"]').fill(lead.zip);

    await frame.locator('[name="appointment_date_1"]').click();
    await frame.locator('.ui-datepicker-today a').click();

    await frame.locator('label:has-text("Anytime")').click();

    console.log("Submitting form");

    await frame.locator('button:has-text("Submit Request")').click();

    await page.waitForTimeout(4000);

    console.log("Submission attempted");

  } catch (error) {

    console.error("Playwright error:", error);

  } finally {

    await page.close();   // CLOSE PAGE ONLY

  }

}

app.post("/lead", async (req, res) => {

  try {

    console.log("Webhook received from Vapi");

    const callId = req.body?.call?.id;

    if (callId && processedCalls.has(callId)) {
      console.log("Duplicate webhook ignored");
      return res.sendStatus(200);
    }

    if (callId) {
      processedCalls.add(callId);
    }

    const outputs = req.body?.message?.artifact?.structuredOutputs;

    if (!outputs) {
      return res.sendStatus(200);
    }

    const lead = Object.values(outputs)[0]?.result;

    if (!lead || !lead.leadComplete) {
      return res.sendStatus(200);
    }

    console.log("Lead captured:", lead);

    await sendSMS(lead).catch(() => {});
await submitLeadWithPlaywright(lead);

    res.sendStatus(200);

  } catch (error) {

    console.error("Server error:", error);
    res.sendStatus(500);

  }

});

/* START BROWSER WHEN SERVER STARTS */

app.listen(3000, async () => {

  console.log("Server running on port 3000");

  await startBrowser();

});
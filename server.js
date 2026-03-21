import twilio from "twilio";
import express from "express";
import { chromium } from "playwright";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const app = express();
app.use(express.json());

const processedCalls = new Set();

/* ================= SMS ================= */

async function sendSMS(lead) {
  try {
    const cleanPhone = lead.phone.replace(/\D/g, "").slice(-10);

    const message = `Hey ${lead.firstName}, this is Mac with Green Machines.

You're set for ${lead.serviceNeeded}.

Check your email to add your card on file so we can get your service started.`;

    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: `+1${cleanPhone}`
    });

    console.log("SMS sent successfully:", result.sid);
  } catch (error) {
    console.error("SMS failed:", error.message);
  }
}

/* ================= BROWSER ================= */

let browser;

async function startBrowser() {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  console.log("Chromium started");
}

async function getLawnProFrame(page) {
  const frameHandle = await page.waitForSelector(
    'iframe[src*="lawnprosoftware"]',
    { timeout: 60000 }
  );

  const frame = await frameHandle.contentFrame();

  if (!frame) {
    throw new Error("Could not get LawnPro iframe content");
  }

  return frame;
}

/* ================= FORM ================= */

async function submitLeadWithPlaywright(lead) {
  const page = await browser.newPage();

  try {
    console.log("Opening website...");

    await page.goto(
      "https://www.greenmachineslawncare.com/#GetaFreeQuote",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    /* STEP 1 */
    let frame = await getLawnProFrame(page);
    await frame.waitForSelector('input[name="first_name"]', { timeout: 60000 });

    console.log("Filling step 1");

    await frame.locator('input[name="first_name"]').fill(lead.firstName);
    await frame.locator('input[name="last_name"]').fill(lead.lastName);
    await frame.locator('input[name="email"]').fill(lead.email);
    await frame.locator('input[name="phone"]').fill(lead.phone);

    await frame.locator('button.lh-btn-next:visible').click();

    /* STEP 2 */
    frame = await getLawnProFrame(page);
    await frame.waitForSelector(`label:has(input[value="${lead.serviceNeeded}"])`, {
      timeout: 60000
    });

    console.log("Filling step 2");
    console.log("Selected service:", lead.serviceNeeded);

    await frame.locator(`label:has(input[value="${lead.serviceNeeded}"])`).click();

    const details =
      lead.tellUsMore &&
      lead.tellUsMore !== "null" &&
      lead.tellUsMore !== "No additional details provided."
        ? lead.tellUsMore
        : "";

    if (details) {
      const detailsField = frame.locator('[name="request_details"]');
      if (await detailsField.count()) {
        await detailsField.fill(details);
      }
    }

    await frame.locator('button.lh-btn-next:visible').click();

    /* STEP 3 */
    frame = await getLawnProFrame(page);
    await frame.waitForSelector('input[name="addr_1"]', { timeout: 60000 });

    console.log("Filling step 3");

    await frame.locator('input[name="addr_1"]').fill(lead.streetAddress);
    await frame.locator('input[name="city"]').fill(lead.city);
    await frame.locator('input[name="state"]').fill(lead.state);
    await frame.locator('input[name="zip"]').fill(lead.zip);

    /* ✅ TERMS CHECKBOX */
    console.log("Checking terms of service");

    const terms = frame.locator(
      'label:has-text("Pricing is subject to adjustment")'
    );

    if (await terms.count()) {
      await terms.click();
    } else {
      const checkbox = frame.locator('input[type="checkbox"]');
      if (await checkbox.count()) {
        await checkbox.first().check();
      }
    }

    console.log("Submitting form");

    await frame.locator('button:has-text("Submit Request")').click();

    await page.waitForTimeout(4000);

    console.log("Submission attempted");
  } catch (error) {
    console.error("Playwright error:", error);
  } finally {
    await page.close();
  }
}

/* ================= WEBHOOK ================= */

app.post("/lead", async (req, res) => {
  try {
    console.log("Webhook received");

    const callId = req.body?.call?.id;

    if (callId && processedCalls.has(callId)) {
      console.log("Duplicate ignored");
      return res.sendStatus(200);
    }

    if (callId) {
      processedCalls.add(callId);

      setTimeout(() => {
        processedCalls.delete(callId);
      }, 1000 * 60 * 10);
    }

    const outputs = req.body?.message?.artifact?.structuredOutputs;

    if (!outputs) return res.sendStatus(200);

    const lead = Object.values(outputs)[0]?.result;

    if (!lead || !lead.leadComplete) {
      console.log("Lead not complete yet");
      return res.sendStatus(200);
    }

    /* ✅ PRICE ACCEPTANCE FILTER */
    if (!lead.serviceNeeded) {
  console.log("No service selected — skipping");
  return res.sendStatus(200);
}

    console.log("Lead captured:", lead);

    const missingFields = [];

    if (!lead.phone) missingFields.push("phone");
    if (!lead.streetAddress) missingFields.push("streetAddress");
    if (!lead.city) missingFields.push("city");
    if (!lead.state) missingFields.push("state");
    if (!lead.zip) missingFields.push("zip");

    if (missingFields.length > 0) {
      console.log("Incomplete lead — skipping automation:", missingFields);
      return res.sendStatus(200);
    }

    const cleanPhone = lead.phone.replace(/\D/g, "");

    if (cleanPhone.length !== 10) {
      console.log("Invalid phone number — skipping:", lead.phone);
      return res.sendStatus(200);
    }

    await sendSMS(lead).catch(() => {});
    await submitLeadWithPlaywright(lead);

    res.sendStatus(200);
  } catch (error) {
    console.error("Server error:", error);
    res.sendStatus(500);
  }
});

/* ================= START ================= */

app.listen(3000, async () => {
  console.log("Server running on port 3000");
  await startBrowser();
});
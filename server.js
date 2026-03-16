import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

async function submitLeadWithPlaywright(lead) {

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  try {

    console.log("Opening website...");

    await page.goto(
      "https://www.greenmachineslawncare.com/#GetaFreeQuote",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    await page.waitForTimeout(5000);

    console.log("Page loaded");

    let frame = page.frames().find(f =>
      f.url().includes("lawnprosoftware.com")
    );

    if (!frame) {
      frame = page.mainFrame();
    }

    console.log("Filling form");

    await frame.locator('input[name="first_name"]').fill(lead.firstName || "");
    await frame.locator('input[name="last_name"]').fill(lead.lastName || "");
    await frame.locator('input[name="email"]').fill(lead.email || "");
    await frame.locator('input[name="phone"]').fill(lead.phone || "");

    await frame.locator('input[name="addr_1"]').fill(lead.streetAddress || "");
    await frame.locator('input[name="city"]').fill(lead.city || "");
    await frame.locator('input[name="state"]').fill(lead.state || "");
    await frame.locator('input[name="zip"]').fill(lead.zip || "");

    const serviceField = frame.locator('[name="request_for"]');
    const serviceTag = await serviceField.evaluate(el => el.tagName.toLowerCase());

    if (serviceTag === "select") {
      await serviceField.selectOption({ label: lead.serviceNeeded });
    } else {
      await serviceField.fill(lead.serviceNeeded || "");
    }

    const details =
      lead.tellUsMore &&
      lead.tellUsMore !== "null" &&
      lead.tellUsMore !== "No additional details provided."
        ? lead.tellUsMore
        : "";

    await frame.locator('[name="request_details"]').fill(details);

    const freqField = frame.locator('[name="request_frequency"]');

    if (await freqField.count()) {
      const tag = await freqField.evaluate(el => el.tagName.toLowerCase());

      if (tag === "select") {
        await freqField.selectOption({ label: "One time" });
      } else {
        await freqField.fill("One time");
      }
    }

    const dateField = frame.locator('[name="appointment_date_1"]');

    if (await dateField.count()) {
      await dateField.fill(lead.bestDayForVisit || "");
    }

    const timeField = frame.locator('[name="appointment_times[]"]');

    if (await timeField.count()) {
      const tag = await timeField.evaluate(el => el.tagName.toLowerCase());

      if (tag === "select") {
        await timeField.selectOption({ label: "Any time" }).catch(() => {});
      }
    }

    console.log("Taking screenshot before submit");

    await page.screenshot({
      path: "/tmp/before-submit.png",
      fullPage: true
    });

    const submitButton =
      frame.locator('button[type="submit"], input[type="submit"]').first();

    await submitButton.click();

    await page.waitForTimeout(5000);

    console.log("Taking screenshot after submit");

    await page.screenshot({
      path: "/tmp/after-submit.png",
      fullPage: true
    });

    console.log("Submission attempted");

  } catch (error) {

    console.error("Playwright error:", error);

  } finally {

    await browser.close();

  }

}

app.post("/lead", async (req, res) => {

  try {

    console.log("Webhook received from Vapi");

    const outputs = req.body?.message?.artifact?.structuredOutputs;

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

    await submitLeadWithPlaywright(lead);

    res.sendStatus(200);

  } catch (error) {

    console.error("Server error:", error);
    res.sendStatus(500);

  }

});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

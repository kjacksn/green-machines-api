import express from "express";
import multer from "multer";
import { chromium } from "playwright";

const app = express();
app.use(express.json());
const upload = multer();

const processedCalls = new Set();
const LAWNPRO_LOGIN_URL = "https://secure.lawnprosoftware.com/login";

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
  const iframeSelector = 'iframe[src*="lawnprosoftware"]';
  const iframeElement = await page.waitForSelector(iframeSelector, {
    state: "attached",
    timeout: 60000
  });

  for (let attempt = 1; attempt <= 5; attempt++) {
    const frame = await iframeElement.contentFrame();

    if (frame) {
      await frame.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
      return frame;
    }

    await page.waitForTimeout(500);
  }

  throw new Error("Could not get LawnPro iframe content");
}

/* ================= VALIDATION / NORMALIZATION ================= */

function trimValue(value) {
  return typeof value === "string" ? value.trim() : value;
}

function generatePlaceholderEmail(lead) {
  const firstName = (lead.firstName || "lead").toLowerCase().replace(/\s+/g, "");
  const lastName = (lead.lastName || "contact").toLowerCase().replace(/\s+/g, "");
  return `${firstName}.${lastName}.${Date.now()}@noemail.greenmachines`;
}

function validateAndNormalizeLead(lead) {
  if (!lead || typeof lead !== "object") {
    return { success: false, error: "Missing lead payload", lead: null };
  }

  const normalizedLead = {
    firstName: trimValue(lead.firstName) || "",
    lastName: trimValue(lead.lastName) || "",
    phone: trimValue(lead.phone) || "",
    streetAddress: trimValue(lead.streetAddress) || "",
    city: trimValue(lead.city) || "",
    state: trimValue(lead.state) || "",
    zip: trimValue(lead.zip) || "",
    serviceNeeded: trimValue(lead.serviceNeeded) || "",
    tellUsMore: lead.tellUsMore == null ? null : trimValue(lead.tellUsMore) || null,
    leadComplete: lead.leadComplete === true
  };

  const requiredFields = [
    "firstName",
    "lastName",
    "phone",
    "streetAddress",
    "city",
    "state",
    "zip"
  ];

  for (const field of requiredFields) {
    if (!normalizedLead[field]) {
      return { success: false, error: `Missing required field: ${field}`, lead: null };
    }
  }

  if (!normalizedLead.leadComplete) {
    return { success: false, error: "leadComplete must be true", lead: null };
  }

  const phoneDigits = normalizedLead.phone.replace(/\D/g, "");

  if (phoneDigits.length !== 10) {
    return { success: false, error: "Phone must contain exactly 10 digits", lead: null };
  }

  normalizedLead.phone = phoneDigits;

  return { success: true, error: null, lead: normalizedLead };
}

/* ================= PLAYWRIGHT ================= */

async function clickNextButton(frame) {
  const nextButton = frame.locator("button.lh-btn-next:visible").first();
  await nextButton.waitFor({ state: "visible", timeout: 60000 });
  await nextButton.click();
}

async function waitForSubmissionConfirmation(page, frame) {
  await Promise.race([
    frame.waitForSelector('button:has-text("Submit")', {
      state: "detached",
      timeout: 15000
    }),
    frame.waitForSelector("text=/thank you|thanks|submitted|we received/i", {
      timeout: 15000
    }),
    page.waitForLoadState("networkidle", { timeout: 15000 })
  ]).catch(() => {
    throw new Error("Submission confirmation was not detected");
  });
}

function logStep(tag, message) {
  console.log(`[${tag}] ${message}`);
}

async function isVisible(locator, timeout = 1500) {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

async function dismissNotificationPrompt(page) {
  const noThanksButton = page.getByRole("button", { name: "No Thanks" });
  if (await isVisible(noThanksButton, 1200)) {
    logStep("NAVIGATION", "Dismissing notification prompt");
    await noThanksButton.click();
  }
}

async function collapseSidebarOverlay(page) {
  const overlayIsBlocking = await page
    .locator("#sidebar_container__overlay")
    .evaluate((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.pointerEvents !== "none" &&
        rect.width > 0 &&
        rect.height > 0
      );
    })
    .catch(() => false);

  if (!overlayIsBlocking) {
    return;
  }

  const menuToggle = page.locator("#menuToggleBtn");
  if (!(await isVisible(menuToggle, 1500))) {
    throw new Error("Sidebar overlay is blocking the page and the menu toggle is not available.");
  }

  logStep("NAVIGATION", "Closing sidebar overlay");
  await menuToggle.click();
  await page.waitForTimeout(300);
}

async function preparePage(page) {
  await dismissNotificationPrompt(page);
  await collapseSidebarOverlay(page);
}

async function requireVisible(locator, description, timeout = 10000) {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return locator;
  } catch {
    throw new Error(`Expected "${description}" to be visible, but it was not found.`);
  }
}

async function clickRequired(locator, description, timeout = 10000) {
  await requireVisible(locator, description, timeout);
  try {
    await locator.click();
  } catch (error) {
    throw new Error(`Could not click "${description}": ${error.message}`);
  }
}

async function fillRequired(locator, value, description, timeout = 10000) {
  await requireVisible(locator, description, timeout);
  try {
    await locator.fill(value);
  } catch (error) {
    throw new Error(`Could not fill "${description}": ${error.message}`);
  }
}

async function selectRequired(locator, optionLabel, description, timeout = 10000) {
  await requireVisible(locator, description, timeout);
  try {
    await locator.selectOption({ label: optionLabel });
  } catch (error) {
    throw new Error(`Could not select "${optionLabel}" in "${description}": ${error.message}`);
  }
}

async function submitLeadWithPlaywrightOnce(lead) {
  const page = await browser.newPage();

  try {
    await page.goto(
      "https://www.greenmachineslawncare.com/#GetaFreeQuote",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    /* STEP 1 */
    let frame = await getLawnProFrame(page);
    await frame.waitForSelector('input[name="first_name"]', {
      state: "visible",
      timeout: 60000
    });

    await frame.locator('input[name="first_name"]').fill(lead.firstName);
    await frame.locator('input[name="last_name"]').fill(lead.lastName);
    await frame.locator('input[name="email"]').fill(lead.email);
    await frame.locator('input[name="phone"]').fill(lead.phone);

    await clickNextButton(frame);

    /* STEP 2 */
    frame = await getLawnProFrame(page);

    if (lead.serviceNeeded) {
      const serviceOption = frame.locator(`label:has(input[value="${lead.serviceNeeded}"])`).first();
      await serviceOption.waitFor({ state: "visible", timeout: 60000 });
      await serviceOption.click();
    }

    const details =
      lead.tellUsMore &&
      lead.tellUsMore !== "null" &&
      lead.tellUsMore !== "No additional details provided."
        ? lead.tellUsMore
        : "";

    if (details) {
      const detailsField = frame.locator('[name="request_details"]').first();
      if (await detailsField.count()) {
        await detailsField.fill(details);
      }
    }

    await clickNextButton(frame);

    /* STEP 3 */
    frame = await getLawnProFrame(page);
    await frame.waitForSelector('input[name="addr_1"]', {
      state: "visible",
      timeout: 60000
    });

    await frame.locator('input[name="addr_1"]').fill(lead.streetAddress);
    await frame.locator('input[name="city"]').fill(lead.city);
    await frame.locator('input[name="state"]').fill(lead.state);
    await frame.locator('input[name="zip"]').fill(lead.zip);

    const consentCheckbox = frame.locator('input[type="checkbox"]').first();
    await consentCheckbox.waitFor({ state: "visible", timeout: 60000 });
    await consentCheckbox.check();

    const submitButton = frame.locator('button:has-text("Submit")').first();
    await submitButton.waitFor({ state: "visible", timeout: 60000 });
    await submitButton.click();

    await waitForSubmissionConfirmation(page, frame);

    return { success: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  } finally {
    await page.close();
  }
}

async function submitLeadWithPlaywright(lead) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[PLAYWRIGHT ATTEMPT ${attempt}]`);

    const result = await submitLeadWithPlaywrightOnce(lead);

    if (result.success) {
      console.log("[PLAYWRIGHT SUCCESS]");
      return result;
    }

    lastError = result.error;
  }

  console.log(`[PLAYWRIGHT FAILED: ${lastError}]`);
  return {
    success: false,
    error: lastError || "Unknown Playwright error"
  };
}

/* ================= ACTIVATION FUNCTION ================= */

async function activateCustomerInLawnPro(lead) {
  const email = process.env.LAWNPRO_EMAIL;
  const password = process.env.LAWNPRO_PASSWORD;
  const phone = lead.phone;
  const fallbackName = `${lead.firstName} ${lead.lastName}`;
  const page = await browser.newPage();
  let customerPage = null;

  console.log("[ACTIVATION START]");

  try {
    if (!email || !password) {
      throw new Error("LAWNPRO_EMAIL and LAWNPRO_PASSWORD must be set in the environment.");
    }

    await page.goto(LAWNPRO_LOGIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    const emailField = page.getByRole("textbox", { name: "Email" });

    if (await isVisible(emailField, 2000)) {
      await fillRequired(emailField, email, "Email field");
      await fillRequired(page.getByRole("textbox", { name: "Password" }), password, "Password field");
      await clickRequired(page.getByRole("button", { name: "Log In" }), "Log In button");
      await page.waitForURL(/secure\.lawnprosoftware\.com\/?$/, { timeout: 20000 });
    }

    await preparePage(page);

    console.log("[ACTIVATION NAVIGATION]");
    await clickRequired(page.locator('a.nav-link:has-text("Customers")').first(), "Customers sidebar link");
    await clickRequired(
      page.locator('a.dropdown-item:has-text("Work Requests")').first(),
      "Work Requests submenu link"
    );

    await page.waitForURL(/\/customers\/work_requests/, { timeout: 20000 });
    await preparePage(page);

    console.log("[ACTIVATION SEARCH]");
    let targetRow = page.locator("tr", { hasText: phone }).first();

    if ((await targetRow.count()) === 0) {
      targetRow = page.locator("tr", { hasText: fallbackName }).first();
    }

    if ((await targetRow.count()) === 0) {
      throw new Error(`No work request row matched ${phone} or ${fallbackName}.`);
    }

    await requireVisible(targetRow, "target customer row");
    await clickRequired(
      targetRow.locator('a[href*="/customers/work_requests/view/"]').first(),
      "work request view button"
    );

    await page.waitForURL(/\/customers\/work_requests\/view\//, { timeout: 20000 });
    await preparePage(page);

    [customerPage] = await Promise.all([
      page.waitForEvent("popup", { timeout: 10000 }),
      clickRequired(page.getByRole("link", { name: "View Customer" }), "View Customer button")
    ]);

    await customerPage.waitForLoadState("domcontentloaded");
    await preparePage(customerPage);

    const statusLink = customerPage.locator("#custom_status");
    await requireVisible(statusLink, "Status field");

    const currentStatus = (await statusLink.textContent())?.trim() || "";

    if (currentStatus !== "Active") {
      await clickRequired(statusLink, "Status field");

      const statusDropdown = customerPage
        .locator("form")
        .filter({ hasText: "Written off With Balance Remaining" })
        .getByRole("combobox");

      await selectRequired(statusDropdown, "Active", "Status dropdown");

      const confirmationDialog = customerPage.getByRole("dialog");
      await requireVisible(confirmationDialog, "activation confirmation popup");
      await clickRequired(confirmationDialog.getByRole("button", { name: "Yes" }), "Yes button");

      await requireVisible(
        customerPage.locator("#custom_status").filter({ hasText: "Active" }),
        "Active status"
      );
    }

    console.log("[ACTIVATION SUCCESS]");
    return { success: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[ACTIVATION FAILED: ${message}]`);
    return { success: false, error: message };
  } finally {
    if (customerPage && !customerPage.isClosed()) {
      await customerPage.close().catch(() => {});
    }

    await page.close().catch(() => {});
  }
}

/* ================= WEBHOOK ================= */

app.post("/lead", async (req, res) => {
  try {
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

    if (!lead) {
      return res.sendStatus(200);
    }

    console.log("[LEAD RECEIVED]", lead);

    const validationResult = validateAndNormalizeLead(lead);

    if (!validationResult.success) {
      console.log(`[VALIDATION FAILED: ${validationResult.error}]`);
      return res.status(200).json({
        success: false,
        error: validationResult.error
      });
    }

    console.log("[VALIDATION PASSED]");

    const normalizedLead = validationResult.lead;
    const submissionLead = {
      ...normalizedLead,
      email: generatePlaceholderEmail(normalizedLead)
    };

    const submissionResult = await submitLeadWithPlaywright(submissionLead);

    /* ================= INTEGRATION POINT ================= */
    if (submissionResult.success) {
      await activateCustomerInLawnPro(submissionLead);
    }

    return res.status(200).json(submissionResult);
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    });
  }
});

// ===== CARD ADDED WEBHOOK (NEW) =====

app.post("/card-added", upload.none(), async (req, res) => {
  try {
    console.log("[CARD ADDED EMAIL RECEIVED]");
    console.log(req.body.text || req.body.html);
    return res.sendStatus(200);
  } catch (error) {
    console.error("Card added webhook error:", error);
    return res.sendStatus(200);
  }
});

/* ================= START ================= */

app.listen(3000, async () => {
  console.log("Server running on port 3000");
  await startBrowser();
});

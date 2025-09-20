import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import delay from 'delay';
import path from 'path';
import os from 'os';

export class GoogleMapsScraper {
  constructor(options = {}) {
    this.headless = options.headless !== false;
    this.viewport = options.viewport || { width: 1366, height: 768 };
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    this.maxResults = options.maxResults || 50;
    this.persistentCache = options.persistentCache !== false; // Enable by default
    this.userDataDir = options.userDataDir || path.join(os.tmpdir(), 'google-maps-scraper-cache');
    this.browser = null;
    this.page = null;
  }

  async init() {
    const launchOptions = {
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--lang=es-ES',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--disable-features=VizDisplayCompositor',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript-harmony-shipping',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--enable-features=NetworkService,NetworkServiceLogging',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--use-mock-keychain',
        '--disable-component-extensions-with-background-pages',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-domain-reliability',
        '--disable-background-downloads',
        '--disable-add-to-shelf',
        '--disable-client-side-phishing-detection',
        '--disable-datasaver-prompt',
        '--disable-device-discovery-notifications',
        '--disable-domain-reliability',
        '--disable-features=AudioServiceOutOfProcess,IPH_PasswordsAccountStorageFeature,IPH_ProfileSwitchFeature,IPH_ReadingListDiscoveryFeature,IPH_ReadingListEntryPointFeature,IPH_ReadingListInSidePanelFeature,IPH_SideSearchFeature,IPH_TabGroupsFeature,IPH_WebUITabStripFeature,OptimizationHints,OptimizationHintsFetching,OptimizationTargetPrediction',
        '--aggressive-cache-discard',
        '--enable-automation',
        '--password-store=basic',
        '--use-mock-keychain'
      ]
    };

    // Add persistent user data directory if enabled
    if (this.persistentCache) {
      launchOptions.userDataDir = this.userDataDir;
      console.log(`Using persistent cache at: ${this.userDataDir}`);
    }

    this.browser = await puppeteer.launch(launchOptions);

    // Close any default blank tabs that might have opened
    const pages = await this.browser.pages();
    for (const page of pages) {
      if (page.url() === 'about:blank' || page.url() === '') {
        await page.close();
      }
    }

    this.page = await this.browser.newPage();
    await this.page.setViewport(this.viewport);
    await this.page.setUserAgent(this.userAgent);

    // Set Spanish locale
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    });

    // Bring this page to front to ensure focus
    await this.page.bringToFront();
  }

  async handleConsentDialogs() {
    console.log('Checking for consent dialogs...');

    // Strategy 1: Direct button click by text content
    try {
      const acceptButtonClicked = await this.page.evaluate(() => {
        // Look for buttons with "Aceptar todo" text
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const button of buttons) {
          const text = button.textContent?.toLowerCase().trim();
          if (text && (text.includes('aceptar todo') || text.includes('accept all'))) {
            console.log('Found accept button:', button.textContent);
            button.click();
            return true;
          }
        }
        return false;
      });

      if (acceptButtonClicked) {
        console.log('Successfully clicked "Aceptar todo" button via text search');
        await delay(2000);
        return;
      }
    } catch (e) {
      console.log('Strategy 1 failed:', e.message);
    }

    // Strategy 2: Keyboard navigation approach (Tab + Enter variations)
    try {
      const hasDialog = await this.page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal, div[style*="position: fixed"]');
        return Array.from(dialogs).some(dialog => dialog.offsetParent !== null);
      });

      if (hasDialog) {
        console.log('Found dialog, trying multiple keyboard navigation strategies...');

        // Ensure the page has focus
        await this.page.bringToFront();
        await delay(500);

        // Try different tab sequences
        const tabSequences = [3, 2, 4, 1]; // Try 3 tabs first, then others

        for (const tabCount of tabSequences) {
          console.log(`Trying ${tabCount} tabs + Enter...`);

          // Click in the center of the page/dialog to ensure proper focus
          const viewport = await this.page.viewport();
          const centerX = viewport.width / 2;
          const centerY = viewport.height / 2;

          console.log(`Clicking at center (${centerX}, ${centerY}) to focus dialog`);
          await this.page.mouse.click(centerX, centerY);
          await delay(500);

          // Press Tab the specified number of times
          for (let i = 0; i < tabCount; i++) {
            await this.page.keyboard.press('Tab');
            await delay(200);
          }

          // Press Enter
          await this.page.keyboard.press('Enter');
          await delay(1500);

          // Check if dialog disappeared
          const dialogStillExists = await this.page.evaluate(() => {
            const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal, div[style*="position: fixed"]');
            return Array.from(dialogs).some(dialog => dialog.offsetParent !== null);
          });

          if (!dialogStillExists) {
            console.log(`Consent dialog handled successfully via ${tabCount} tabs + Enter`);
            return;
          }
        }
      }
    } catch (e) {
      console.log('Strategy 2 failed:', e.message);
    }

    // Strategy 3: Find and click the rightmost/last button in dialogs
    try {
      const buttonClicked = await this.page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal');

        for (const dialog of dialogs) {
          if (dialog.offsetParent !== null) {
            const buttons = dialog.querySelectorAll('button');
            if (buttons.length > 0) {
              // Click the last button (usually "Accept")
              const lastButton = buttons[buttons.length - 1];
              console.log('Clicking last button in dialog:', lastButton.textContent);
              lastButton.click();
              return true;
            }
          }
        }
        return false;
      });

      if (buttonClicked) {
        console.log('Successfully clicked last button in dialog');
        await delay(2000);
        return;
      }
    } catch (e) {
      console.log('Strategy 3 failed:', e.message);
    }

    // Fallback: Array of selectors for different consent dialogs in Spanish/EU
    const consentSelectors = [
      // Google's "Accept all" buttons in Spanish
      'button[aria-label*="Aceptar todo"]',
      'button[aria-label*="Accept all"]',
      'button[aria-label*="Acepto"]',
      'button[aria-label*="Accept"]',

      // Common Spanish consent button texts
      'button:has-text("Aceptar todo")',
      'button:has-text("Acepto")',
      'button:has-text("Aceptar")',
      'button:has-text("Accept all")',
      'button:has-text("I agree")',
      'button:has-text("Estoy de acuerdo")',

      // More specific cookie consent buttons
      'button:contains("Aceptar todo")',
      'button:contains("Accept all")',
      'button:contains("Acepto")',

      // Generic consent selectors
      '[data-testid="accept-all"]',
      '[data-testid="accept-button"]',
      'button[data-action="accept"]',
      'button[id*="accept"]',
      'button[class*="accept"]',

      // Cookie banner specific
      '#L2AGLb', // Google's specific accept button ID
      'button[jsname="b3VHJd"]', // Another Google Maps specific selector

      // Policy dialog selectors
      'div[role="dialog"] button:last-child',
      'div[aria-modal="true"] button:last-child'
    ];

    // Try each selector with a timeout
    for (const selector of consentSelectors) {
      try {
        await this.page.waitForSelector(selector, { timeout: 2000 });
        console.log(`Found consent dialog with selector: ${selector}`);

        await this.page.click(selector);
        console.log('Clicked consent button');
        await delay(1500);

        // Check if dialog disappeared
        const stillVisible = await this.page.$(selector);
        if (!stillVisible) {
          console.log('Consent dialog handled successfully');
          return;
        }
      } catch (e) {
        // Selector not found, try next one
        continue;
      }
    }

    // Alternative approach: look for any visible modal/dialog and click the primary button
    try {
      const dialogExists = await this.page.evaluate(() => {
        // Look for modal dialogs
        const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal, div[style*="position: fixed"]');

        for (const dialog of dialogs) {
          if (dialog.offsetParent !== null) { // Check if visible
            // Look for buttons that might be accept buttons
            const buttons = dialog.querySelectorAll('button');
            for (const button of buttons) {
              const text = button.textContent.toLowerCase().trim();
              const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

              // Check for "Aceptar todo" (Accept all) specifically
              if (text.includes('aceptar todo') || text.includes('accept all') ||
                  text.includes('acepto') || text.includes('accept') || text.includes('aceptar') ||
                  ariaLabel.includes('acepto') || ariaLabel.includes('accept') || ariaLabel.includes('aceptar') ||
                  button.getAttribute('data-action') === 'accept') {
                button.click();
                return true;
              }
            }

            // Look for any button with blue/primary styling (usually accept)
            for (const button of buttons) {
              const styles = window.getComputedStyle(button);
              const bgColor = styles.backgroundColor;
              const color = styles.color;

              // Check if it's a primary button (blue background, white text, etc.)
              if (bgColor.includes('rgb(26, 115, 232)') || bgColor.includes('rgb(66, 133, 244)') ||
                  button.classList.contains('btn-primary') || button.classList.contains('primary')) {
                button.click();
                return true;
              }
            }

            // If no specific accept button found, click the last button (usually "accept")
            const lastButton = buttons[buttons.length - 1];
            if (lastButton && lastButton.textContent.toLowerCase().includes('todo')) {
              lastButton.click();
              return true;
            }
          }
        }
        return false;
      });

      if (dialogExists) {
        console.log('Handled consent dialog via modal detection');
        await delay(1500);
      }
    } catch (e) {
      console.log('No consent dialogs found or error handling them:', e.message);
    }
  }

  async searchBusinesses(query, location) {
    if (!this.page) await this.init();

    // Try different approaches to avoid consent dialog
    const approaches = [
      // Approach 1: Use consent bypass parameter
      `https://www.google.com/maps/search/${encodeURIComponent(query)}+${encodeURIComponent(location)}?consent=true`,
      // Approach 2: Use direct search with hl parameter
      `https://www.google.com/maps/search/${encodeURIComponent(query)}+${encodeURIComponent(location)}?hl=es&gl=ES`,
      // Approach 3: Use embed mode which often skips consent
      `https://www.google.com/maps/embed/v1/search?key=your_key&q=${encodeURIComponent(query)}+${encodeURIComponent(location)}`,
      // Approach 4: Standard URL as fallback
      `https://www.google.com/maps/search/${encodeURIComponent(query)}+${encodeURIComponent(location)}`
    ];

    let searchUrl = approaches[1]; // Use approach 2 (hl=es&gl=ES) as primary
    console.log(`Searching: ${searchUrl}`);

    try {
      // Set additional headers to appear more like a regular Spanish user
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      });

      await this.page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      await delay(3000);

      // Check if we still have a consent dialog
      const hasConsentDialog = await this.page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal, div[style*="position: fixed"]');
        return Array.from(dialogs).some(dialog => dialog.offsetParent !== null);
      });

      if (hasConsentDialog) {
        console.log('Consent dialog still present, trying to handle it...');
        await this.handleConsentDialogs();
      } else {
        console.log('No consent dialog found - success!');
      }

    } catch (error) {
      console.log(`Primary approach failed: ${error.message}`);

      // Fallback to standard URL
      searchUrl = approaches[3];
      console.log(`Trying fallback: ${searchUrl}`);

      await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });
      await delay(3000);
      await this.handleConsentDialogs();
    }

    const businesses = [];
    let lastCount = 0;
    let stableCount = 0;

    while (businesses.length < this.maxResults && stableCount < 3) {
      // Check for any new policy dialogs that might appear during scrolling
      await this.handleConsentDialogs();

      // Scroll to load more results
      await this.page.evaluate(() => {
        const scrollableDiv = document.querySelector('[role="main"]');
        if (scrollableDiv) {
          scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
        }
      });

      await delay(2000);

      // Extract business data
      const newBusinesses = await this.page.evaluate(() => {
        const results = [];
        const businessElements = document.querySelectorAll('[data-result-index]');

        businessElements.forEach((element) => {
          try {
            const nameElement = element.querySelector('[role="button"] span');
            const name = nameElement?.textContent?.trim();

            if (!name) return;

            const ratingElement = element.querySelector('[role="img"][aria-label*="star"]');
            const ratingText = ratingElement?.getAttribute('aria-label') || '';
            const rating = parseFloat(ratingText.match(/(\d+\.?\d*)/)?.[1] || '0');

            const reviewCountMatch = ratingText.match(/(\d+(?:,\d+)*)\s+review/);
            const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1].replace(/,/g, '')) : 0;

            const addressElement = element.querySelector('[data-value="Address"]');
            const address = addressElement?.textContent?.trim() || '';

            const phoneElement = element.querySelector('[data-value="Phone number"]');
            const phone = phoneElement?.textContent?.trim() || '';

            const websiteElement = element.querySelector('[data-value="Website"]');
            const website = websiteElement?.getAttribute('href') || '';

            // Extract Google Place ID from the element
            const link = element.querySelector('a[href*="place/"]');
            let placeId = '';
            if (link) {
              const href = link.getAttribute('href');
              const placeMatch = href.match(/place\/([^\/\?]+)/);
              if (placeMatch) {
                placeId = placeMatch[1];
              }
            }

            results.push({
              name,
              address,
              phone,
              website,
              rating,
              reviewCount,
              placeId,
              googleMapsUrl: link?.getAttribute('href') || ''
            });
          } catch (error) {
            console.error('Error extracting business data:', error);
          }
        });

        return results;
      });

      // Merge with existing businesses (avoid duplicates)
      newBusinesses.forEach(business => {
        if (!businesses.find(existing => existing.name === business.name && existing.address === business.address)) {
          businesses.push(business);
        }
      });

      console.log(`Found ${businesses.length} businesses so far...`);

      // Check if we're getting new results
      if (businesses.length === lastCount) {
        stableCount++;
      } else {
        stableCount = 0;
        lastCount = businesses.length;
      }

      await delay(1000);
    }

    return businesses.slice(0, this.maxResults);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  async saveToFile(data, filename) {
    const jsonData = JSON.stringify(data, null, 2);
    await fs.writeFile(filename, jsonData, 'utf8');
    console.log(`Data saved to ${filename}`);
  }

  async clearCache() {
    if (this.persistentCache) {
      try {
        await fs.rm(this.userDataDir, { recursive: true, force: true });
        console.log(`Cache cleared at: ${this.userDataDir}`);
      } catch (error) {
        console.log(`Could not clear cache: ${error.message}`);
      }
    }
  }
}

export default GoogleMapsScraper;
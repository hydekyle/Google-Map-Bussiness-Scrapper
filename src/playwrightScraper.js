import { chromium } from 'playwright';
import fs from 'fs/promises';
import delay from 'delay';
import path from 'path';
import os from 'os';

export class PlaywrightGoogleMapsScraper {
  constructor(options = {}) {
    this.headless = options.headless !== false;
    this.viewport = options.viewport || { width: 1366, height: 768 };
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    this.maxResults = options.maxResults || 50;
    this.persistentCache = options.persistentCache !== false;
    this.userDataDir = options.userDataDir || path.join(os.tmpdir(), 'playwright-maps-scraper-cache');
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async init() {
    const launchOptions = {
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--lang=es-ES',
        '--disable-blink-features=AutomationControlled'
      ]
    };

    this.browser = await chromium.launch(launchOptions);

    const contextOptions = {
      viewport: this.viewport,
      userAgent: this.userAgent,
      locale: 'es-ES',
      geolocation: { longitude: -3.7038, latitude: 40.4168 }, // Madrid coordinates
      permissions: ['geolocation'],
      extraHTTPHeaders: {
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    };

    // Add persistent storage if enabled
    if (this.persistentCache) {
      // Ensure directory exists
      await fs.mkdir(this.userDataDir, { recursive: true });

      const storageStatePath = path.join(this.userDataDir, 'storage-state.json');
      console.log(`Using persistent cache at: ${this.userDataDir}`);

      try {
        // Try to load existing storage state
        const storageState = await fs.readFile(storageStatePath, 'utf8');
        contextOptions.storageState = JSON.parse(storageState);
        console.log('Loaded existing storage state');
      } catch (error) {
        console.log('No existing storage state found, will create new one');
      }
    }

    this.context = await this.browser.newContext(contextOptions);
    this.page = await this.context.newPage();

    // Anti-detection measures
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Remove automation indicators
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    });

    // Visit Google homepage first to establish session and handle consent
    console.log('Visiting Google homepage to establish session...');
    try {
      await this.page.goto('https://www.google.com/?hl=es&gl=ES', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      await delay(3000);

      // Handle consent on Google homepage first
      await this.handleConsentDialogs();

      // Save state after handling consent
      if (this.persistentCache) {
        await this.saveStorageState();
      }
    } catch (error) {
      console.log('Failed to visit Google homepage, continuing anyway:', error.message);
    }
  }

  async handleConsentDialogs() {
    console.log('Checking for consent dialogs with Playwright...');

    // Wait a bit for any dialogs to appear
    await delay(2000);

    try {
      // Strategy 1: Look for specific Google consent buttons
      const acceptButtons = [
        'button:has-text("Aceptar todo")',
        'button:has-text("Accept all")',
        'button:has-text("Acepto")',
        'button[aria-label*="Aceptar todo"]',
        'button[aria-label*="Accept all"]',
        '#L2AGLb', // Google's specific ID
        'button[jsname="b3VHJd"]'
      ];

      for (const selector of acceptButtons) {
        try {
          const button = this.page.locator(selector).first();
          if (await button.isVisible({ timeout: 2000 })) {
            console.log(`Found consent button with selector: ${selector}`);
            await button.click();
            await delay(2000);
            console.log('Successfully clicked consent button');
            return true;
          }
        } catch (e) {
          continue;
        }
      }
    } catch (e) {
      console.log('Strategy 1 failed:', e.message);
    }

    try {
      // Strategy 1.5: Look for Google's specific consent dialog structure
      const googleConsentDialog = this.page.locator('div[role="dialog"]').filter({ hasText: /cookies|consent|aceptar|accept/i }).first();
      if (await googleConsentDialog.isVisible({ timeout: 2000 })) {
        console.log('Found Google consent dialog');
        
        // Look for accept button within this specific dialog
        const acceptButton = googleConsentDialog.locator('button').filter({ hasText: /aceptar|accept|todo|all/i }).first();
        if (await acceptButton.isVisible({ timeout: 1000 })) {
          console.log('Found accept button in Google consent dialog');
          await acceptButton.click();
          await delay(2000);
          console.log('Successfully clicked Google consent button');
          return true;
        }
      }
    } catch (e) {
      console.log('Strategy 1.5 failed:', e.message);
    }

    try {
      // Strategy 1.6: Try to find any button with "Aceptar" text anywhere on the page
      const anyAcceptButton = this.page.locator('button').filter({ hasText: /aceptar todo|aceptar|accept all|accept/i }).first();
      if (await anyAcceptButton.isVisible({ timeout: 2000 })) {
        console.log('Found accept button anywhere on page');
        await anyAcceptButton.click();
        await delay(2000);
        console.log('Successfully clicked accept button');
        return true;
      }
    } catch (e) {
      console.log('Strategy 1.6 failed:', e.message);
    }

    try {
      // Strategy 2: Check for visible dialogs using count instead of isVisible
      const dialogCount = await this.page.locator('[role="dialog"], [aria-modal="true"]').count();
      if (dialogCount > 0) {
        console.log(`Found ${dialogCount} dialog(s), trying to handle them...`);
        
        // Try to find and click the first visible dialog's accept button
        for (let i = 0; i < dialogCount; i++) {
          try {
            const dialog = this.page.locator('[role="dialog"], [aria-modal="true"]').nth(i);
            const isVisible = await dialog.isVisible();
            
            if (isVisible) {
              console.log(`Processing dialog ${i + 1}/${dialogCount}`);
              
              // Get dialog text for debugging
              const dialogText = await dialog.textContent();
              console.log(`Dialog ${i + 1} text: ${dialogText.substring(0, 100)}...`);
              
              // Look for accept buttons within this specific dialog with multiple strategies
              const buttonSelectors = [
                'button:has-text("Aceptar todo")',
                'button:has-text("Accept all")',
                'button:has-text("Acepto")',
                'button:has-text("Aceptar")',
                'button[aria-label*="Aceptar"]',
                'button[aria-label*="Accept"]',
                'button[data-action="accept"]',
                'button[id*="accept"]',
                'button[class*="accept"]',
                'button:last-child', // Last button is often accept
                'button' // Any button as fallback
              ];
              
              for (const selector of buttonSelectors) {
                try {
                  const acceptButton = dialog.locator(selector).first();
                  if (await acceptButton.isVisible({ timeout: 500 })) {
                    const buttonText = await acceptButton.textContent();
                    console.log(`Found button in dialog ${i + 1} with selector "${selector}": "${buttonText}"`);
                    
                    // Check if it looks like an accept button
                    if (buttonText && (buttonText.toLowerCase().includes('aceptar') || 
                        buttonText.toLowerCase().includes('accept') || 
                        buttonText.toLowerCase().includes('todo') ||
                        buttonText.toLowerCase().includes('ok') ||
                        buttonText.toLowerCase().includes('sí') ||
                        buttonText.toLowerCase().includes('yes'))) {
                      console.log('Clicking accept button');
                      await acceptButton.click();
                      await delay(2000);
                      console.log('Successfully clicked accept button');
                      return true;
                    }
                  }
                } catch (e) {
                  continue;
                }
              }
            }
          } catch (e) {
            console.log(`Error processing dialog ${i + 1}:`, e.message);
            continue;
          }
        }
        
        console.log('No accept buttons found in visible dialogs');
      }
    } catch (e) {
      console.log('Strategy 2 failed:', e.message);
    }

    try {
      // Strategy 3: Use keyboard navigation as fallback
      console.log('Trying keyboard navigation...');

      // Click in center of page first
      await this.page.mouse.click(683, 384);
      await delay(500);

      // Try different tab sequences
      for (const tabCount of [3, 2, 4, 1]) {
        console.log(`Trying ${tabCount} tabs + Enter...`);

        // Reset focus by clicking page
        await this.page.mouse.click(683, 384);
        await delay(300);

        // Tab navigation
        for (let i = 0; i < tabCount; i++) {
          await this.page.keyboard.press('Tab');
          await delay(200);
        }

        await this.page.keyboard.press('Enter');
        await delay(1500);

        // Check if dialog is gone
        const remainingDialogs = await this.page.locator('[role="dialog"], [aria-modal="true"]').count();
        if (remainingDialogs === 0) {
          console.log(`Successfully handled dialog with ${tabCount} tabs`);
          return true;
        }
      }
    } catch (e) {
      console.log('Strategy 3 failed:', e.message);
    }

    try {
      // Strategy 4: JavaScript-based dialog dismissal
      console.log('Trying JavaScript-based dialog dismissal...');
      
      const dismissed = await this.page.evaluate(() => {
        // Find all dialogs
        const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"]');
        let dismissed = false;
        
        for (const dialog of dialogs) {
          if (dialog.offsetParent !== null) { // Check if visible
            console.log('Found visible dialog, trying to dismiss...');
            
            // Try to find and click any button
            const buttons = dialog.querySelectorAll('button');
            for (const button of buttons) {
              const text = button.textContent?.toLowerCase().trim() || '';
              const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
              
              // Look for accept-like buttons
              if (text.includes('aceptar') || text.includes('accept') || 
                  text.includes('todo') || text.includes('ok') || 
                  text.includes('sí') || text.includes('yes') ||
                  ariaLabel.includes('aceptar') || ariaLabel.includes('accept')) {
                console.log('Clicking accept button via JS:', text);
                button.click();
                dismissed = true;
                break;
              }
            }
            
            // If no specific accept button, try clicking the last button
            if (!dismissed && buttons.length > 0) {
              const lastButton = buttons[buttons.length - 1];
              console.log('Clicking last button via JS:', lastButton.textContent);
              lastButton.click();
              dismissed = true;
            }
            
            // Try to remove the dialog entirely
            if (!dismissed) {
              console.log('Trying to remove dialog via JS');
              dialog.style.display = 'none';
              dialog.remove();
              dismissed = true;
            }
          }
        }
        
        return dismissed;
      });
      
      if (dismissed) {
        console.log('Successfully dismissed dialog via JavaScript');
        await delay(2000);
        return true;
      }
    } catch (e) {
      console.log('Strategy 4 failed:', e.message);
    }

    console.log('All consent dialog strategies failed');
    return false;
  }

  async saveStorageState() {
    if (!this.persistentCache || !this.context) return;

    try {
      const storageStatePath = path.join(this.userDataDir, 'storage-state.json');
      await this.context.storageState({ path: storageStatePath });
      console.log('Storage state saved successfully');
    } catch (error) {
      console.log('Could not save storage state:', error.message);
    }
  }

  async searchBusinesses(query, location) {
    if (!this.page) await this.init();

    // Try different approaches to bypass consent dialogs
    const searchUrls = [
      // Approach 1: Use consent bypass parameter
      `https://www.google.com/maps/search/${encodeURIComponent(query)}+${encodeURIComponent(location)}?hl=es&gl=ES&consent=yes`,
      // Approach 2: Use embed mode (often skips consent)
      `https://www.google.com/maps/embed/v1/search?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dOWW6i4j1&q=${encodeURIComponent(query)}+${encodeURIComponent(location)}&hl=es`,
      // Approach 3: Standard URL with additional parameters
      `https://www.google.com/maps/search/${encodeURIComponent(query)}+${encodeURIComponent(location)}?hl=es&gl=ES&source=hp`,
      // Approach 4: Standard URL as fallback
      `https://www.google.com/maps/search/${encodeURIComponent(query)}+${encodeURIComponent(location)}?hl=es&gl=ES`
    ];

    let searchUrl = searchUrls[0]; // Start with consent bypass
    console.log(`Searching with Playwright: ${searchUrl}`);

    try {
      // Use more lenient navigation settings for Google Maps
      await this.page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });

      // Wait for the page to start loading content
      await delay(5000);

      // Wait for search results to appear or timeout gracefully
      try {
        await this.page.waitForSelector('[data-result-index], [role="main"]', {
          timeout: 10000
        });
        console.log('Search results container found');
      } catch (e) {
        console.log('Search results took longer to load, continuing anyway...');
      }

      // Check for consent dialog
      const dialogCount = await this.page.locator('[role="dialog"], [aria-modal="true"]').count();
      if (dialogCount > 0) {
        console.log(`Found ${dialogCount} dialog(s) on Maps page`);
        const handled = await this.handleConsentDialogs();
        if (handled) {
          // Save state after successful consent handling
          await this.saveStorageState();
          // Wait a bit more after handling consent
          await delay(3000);
        }
      } else {
        console.log('No consent dialog found on Maps page - success!');
      }

    } catch (error) {
      console.log(`Primary approach failed: ${error.message}`);
      
      // Try fallback URLs
      for (let i = 1; i < searchUrls.length; i++) {
        try {
          searchUrl = searchUrls[i];
          console.log(`Trying fallback approach ${i + 1}: ${searchUrl}`);
          
          await this.page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 20000
          });
          
          await delay(5000);
          
          // Check if this approach worked
          const dialogCount = await this.page.locator('[role="dialog"], [aria-modal="true"]').count();
          if (dialogCount === 0) {
            console.log(`Fallback approach ${i + 1} successful - no dialogs found`);
            break;
          } else {
            console.log(`Fallback approach ${i + 1} still has ${dialogCount} dialogs`);
            await this.handleConsentDialogs();
          }
          
          break; // Exit the fallback loop
        } catch (fallbackError) {
          console.log(`Fallback approach ${i + 1} failed: ${fallbackError.message}`);
          continue;
        }
      }
    }

    const businesses = [];
    const processedBusinesses = new Set(); // Track processed businesses to avoid duplicates

    // First, scroll to load more results
    await this.page.evaluate(() => {
      const scrollableDiv = document.querySelector('[role="main"]');
      if (scrollableDiv) {
        scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
      } else {
        window.scrollTo(0, document.body.scrollHeight);
      }
    });

    await delay(3000);

    // Find all business list items (more specific selectors)
    const businessListItems = await this.page.locator('[data-result-index], a[href*="place/"]').all();
    console.log(`Found ${businessListItems.length} business list items to process`);
    
    // Filter out non-business elements
    const validBusinessItems = [];
    for (const item of businessListItems) {
      try {
        const text = await item.textContent();
        const href = await item.getAttribute('href');
        
        // Extract business name from URL if text is empty
        let businessName = text;
        if (!businessName && href && href.includes('place/')) {
          const urlMatch = href.match(/place\/([^\/\?]+)/);
          if (urlMatch) {
            businessName = decodeURIComponent(urlMatch[1].replace(/\+/g, ' '));
          }
        }
        
        console.log(`Checking item: "${businessName}" - href: ${href}`);
        
        // Skip elements that are clearly not businesses
        if (businessName && 
            !businessName.toLowerCase().includes('resultados') && 
            !businessName.toLowerCase().includes('filtros') &&
            !businessName.toLowerCase().includes('valoración') &&
            !businessName.toLowerCase().includes('horario') &&
            businessName.length > 3) { // Must have some content
          validBusinessItems.push(item);
          console.log(`✅ Added valid business: "${businessName}"`);
        } else {
          console.log(`❌ Skipped item: "${businessName}"`);
        }
      } catch (error) {
        console.log(`❌ Error checking item: ${error.message}`);
        continue;
      }
    }
    
    console.log(`Found ${validBusinessItems.length} valid business items after filtering`);

    // Process each business item (limit to avoid infinite loops)
    const maxItemsToProcess = Math.min(validBusinessItems.length, this.maxResults, 20);
    
    for (let i = 0; i < maxItemsToProcess; i++) {
      try {
        console.log(`Processing business ${i + 1}/${maxItemsToProcess}`);
        
        // Click on the business item
        await validBusinessItems[i].click();
        await delay(2000); // Wait for details to load
        
        // Extract detailed information from the clicked business
        const businessDetails = await this.extractBusinessDetails();
        
        if (businessDetails && businessDetails.name && !processedBusinesses.has(businessDetails.name)) {
          businesses.push(businessDetails);
          processedBusinesses.add(businessDetails.name);
          console.log(`✅ Extracted details for: ${businessDetails.name}`);
        } else if (businessDetails && businessDetails.name) {
          console.log(`⏭️ Skipping duplicate: ${businessDetails.name}`);
        }
        
        // Go back to the list view
        await this.page.goBack();
        await delay(1000);
        
      } catch (error) {
        console.log(`❌ Error processing business ${i + 1}:`, error.message);
        // Try to go back to list view if we're stuck
        try {
          await this.page.goBack();
          await delay(1000);
        } catch (backError) {
          console.log('Could not go back, continuing...');
        }
      }
    }

    console.log(`✅ Found ${businesses.length} businesses total`);

    return businesses.slice(0, this.maxResults);
  }

  async extractBusinessDetails() {
    try {
      const details = await this.page.evaluate(() => {
        // Extract business name - robust selectors for Maps detail header
        const nameSelectors = [
          'h1.DUwDvf',
          'h1[data-attrid="title"]',
          '.x3AX1-LfntMc-header-title-title',
          '.fontHeadlineLarge',
          '[data-attrid="kc:/location/location:name"]',
          'h1'
        ];

        let name = '';
        for (const selector of nameSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent && element.textContent.trim()) {
            name = element.textContent.trim();
            break;
          }
        }

        // Fallback: from title
        if (!name) {
          const title = document.title || '';
          const titleMatch = title.match(/^(.+?)\s*-\s*Google Maps/);
          if (titleMatch) name = titleMatch[1].trim();
        }

        // Fallback: from URL
        if (!name) {
          const url = window.location.href;
          const urlMatch = url.match(/place\/([^\/\?]+)/);
          if (urlMatch) name = decodeURIComponent(urlMatch[1].replace(/\+/g, ' '));
        }

        if (!name || name.toLowerCase() === 'resultados') return null;

        // Phone - prefer tel links
        let phone = '';
        const telLink = document.querySelector('a[href^="tel:"]');
        if (telLink) {
          phone = (telLink.getAttribute('href') || '').replace('tel:', '').trim();
        }
        if (!phone) {
          const phoneButton = Array.from(document.querySelectorAll('button'))
            .find(b => (b.getAttribute('data-item-id') || '').startsWith('phone:tel:'));
          if (phoneButton) {
            const di = phoneButton.getAttribute('data-item-id') || '';
            const idx = di.indexOf('phone:tel:');
            if (idx >= 0) phone = di.substring(idx + 'phone:tel:'.length).trim();
          }
        }

        // Address
        let address = '';
        const addressButton = Array.from(document.querySelectorAll('button'))
          .find(b => (b.getAttribute('data-item-id') || '').startsWith('address'));
        if (addressButton && addressButton.textContent) address = addressButton.textContent.trim();
        if (!address) {
          const addrEl = document.querySelector('[data-attrid="kc:/location/location:address"], .Io6YTe');
          if (addrEl && addrEl.textContent) address = addrEl.textContent.trim();
        }

        // Website
        let website = '';
        const websiteLink = document.querySelector('a[data-item-id^="authority"], a[aria-label*="Sitio web" i], a[aria-label*="Website" i]');
        if (websiteLink) website = websiteLink.getAttribute('href') || '';

        // Rating & reviews
        let rating = 0;
        let reviewCount = 0;
        const ratingEl = document.querySelector('[aria-label*="estrellas" i], [aria-label*="stars" i], [data-attrid="kc:/location/location:rating"]');
        if (ratingEl && ratingEl.textContent) {
          const t = ratingEl.textContent.trim();
          const rMatch = t.match(/(\d+[\.,]\d+)/);
          if (rMatch) rating = parseFloat(rMatch[1].replace(',', '.'));
          const cMatch = t.match(/\((\d+(?:[\.,]\d+)*)\)/);
          if (cMatch) reviewCount = parseInt(cMatch[1].replace(/[\.,]/g, ''), 10);
        }

        // Place ID & URL
        const currentUrl = window.location.href;
        const placeMatch = currentUrl.match(/place\/([^\/\?]+)/);
        const placeId = placeMatch ? placeMatch[1] : '';

        return {
          name,
          address,
          phone,
          website,
          rating,
          reviewCount,
          placeId,
          googleMapsUrl: currentUrl
        };
      });

      return details;
    } catch (error) {
      console.log('Error extracting business details:', error.message);
      return null;
    }
  }

  async close() {
    // Always save storage state before closing
    await this.saveStorageState();

    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
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

export default PlaywrightGoogleMapsScraper;
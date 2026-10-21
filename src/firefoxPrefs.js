'use strict';

/**
 * "Quiet Firefox": preferences that stop the browser from talking to anyone
 * except the site you asked it to open. Pass as `firefoxUserPrefs`.
 */
module.exports = {
  // --- Telemetry and reporting -------------------------------------------
  'toolkit.telemetry.enabled': false,            // no telemetry pings
  'toolkit.telemetry.unified': false,            // disable unified telemetry
  'toolkit.telemetry.archive.enabled': false,    // no local archive of pings
  'toolkit.telemetry.server': 'http://127.0.0.1:9/', // dead-end if anything still tries
  'datareporting.healthreport.uploadEnabled': false, // no health report upload
  'datareporting.policy.dataSubmissionEnabled': false, // master switch for data submission
  'browser.ping-centre.telemetry': false,        // new-tab telemetry
  'app.shield.optoutstudies.enabled': false,     // no Shield studies
  'app.normandy.enabled': false,                 // no Normandy experiments
  'app.normandy.api_url': '',                    // and no endpoint to ask
  'browser.discovery.enabled': false,            // no personalised add-on recommendations

  // --- Remote settings ----------------------------------------------------
  'services.settings.server': 'http://127.0.0.1:9/v1', // remote-settings sync goes nowhere
  'extensions.getAddons.cache.enabled': false,   // no add-on metadata fetch
  'extensions.getAddons.showPane': false,        // no discovery pane
  'extensions.update.enabled': false,            // no add-on update checks
  'extensions.blocklist.enabled': false,         // blocklist is fetched from the network

  // --- Application updates ------------------------------------------------
  'app.update.enabled': false,                   // legacy switch
  'app.update.auto': false,                      // never download updates
  'app.update.service.enabled': false,           // no background update service
  'app.update.checkInstallTime': false,          // skip install-time nag

  // --- Connectivity probes and speculative traffic -----------------------
  'network.captive-portal-service.enabled': false, // no captive-portal probe
  'network.connectivity-service.enabled': false,   // no connectivity probe
  'network.prefetch-next': false,                  // no <link rel=prefetch> follow-ups
  'network.dns.disablePrefetch': true,             // no speculative DNS
  'network.dns.disablePrefetchFromHTTPS': true,    // same, for HTTPS pages
  'network.predictor.enabled': false,              // no predictive connections
  'network.http.speculative-parallel-limit': 0,    // no speculative preconnects
  'browser.urlbar.speculativeConnect.enabled': false, // no URL-bar preconnect

  // --- Safe browsing, GMP, OCSP ------------------------------------------
  'browser.safebrowsing.malware.enabled': false,   // no malware list downloads
  'browser.safebrowsing.phishing.enabled': false,  // no phishing list downloads
  'browser.safebrowsing.downloads.enabled': false, // no download checks
  'browser.safebrowsing.downloads.remote.enabled': false, // no remote download lookups
  'browser.safebrowsing.provider.google4.updateURL': '', // no list updates
  'browser.safebrowsing.provider.google.updateURL': '',
  'media.gmp-manager.url': 'http://127.0.0.1:9/',  // no GMP plugin manifest fetch
  'media.gmp-provider.enabled': false,             // no GMP provider
  'media.gmp-gmpopenh264.enabled': false,          // no OpenH264 download
  'media.gmp-widevinecdm.enabled': false,          // no Widevine download
  'security.OCSP.enabled': 0,                      // no OCSP responder lookups

  // --- UI surfaces that phone home ---------------------------------------
  'browser.newtabpage.enabled': false,             // blank new tab, no content feed
  'browser.newtabpage.activity-stream.feeds.telemetry': false,
  'browser.newtabpage.activity-stream.telemetry': false,
  'browser.newtabpage.activity-stream.feeds.section.topstories': false, // no sponsored stories
  'browser.newtabpage.activity-stream.showSponsored': false,
  'browser.region.update.enabled': false,          // no geo lookup for region
  'browser.region.network.url': '',                // and no endpoint for it
  'geo.enabled': false,                            // no geolocation API requests
  'geo.provider.network.url': 'http://127.0.0.1:9/', // dead-end for geolocation
  'browser.startup.homepage_override.mstone': 'ignore', // no "what's new" page
  'startup.homepage_welcome_url': '',              // no first-run page
  'browser.aboutwelcome.enabled': false,           // no welcome flow
  'doh-rollout.disable-heuristics': true,          // no DoH heuristics lookups
  'network.trr.mode': 5,                           // DoH explicitly off, use the system resolver
  'signon.management.page.breach-alerts.enabled': false, // no breach-alert fetches
  'messaging-system.rsexperimentloader.enabled': false,  // no experiment loader
};

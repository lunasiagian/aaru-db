/**
 * Genshin Datasheet — Environment & Backend Configuration
 *
 * Leave APPS_SCRIPT_URL as "" to run in Offline / Mock Mode with realistic sample data.
 * To connect to your Google Apps Script Web App backend, paste the deployment URL below.
 */
window.GENSHIN_SHEET_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbw6zLEx2ivt_QP67GYZcu2or_mXdk0O07218pe9vu0Y50IWutU90YzsftrAz-b4Pg3G/exec",
  APP_VERSION: "v3.0-final",
  ACCOUNTS: {
    almondeluna: {
      username: "almondeluna",
      displayName: "Luna",
      partner: "vanbrohenheim",
      accentLabel: "UID • LUNA"
    },
    vanbrohenheim: {
      username: "vanbrohenheim",
      displayName: "Roy",
      partner: "almondeluna",
      accentLabel: "UID • Roy"
    }
  }
};

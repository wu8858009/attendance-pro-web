/* Apps Script 部署後的 /exec 網址；?api= 只在本機測試時有效，避免被連結導向別的後端 */
window.CONFIG = {
  CLOUD_URL: (["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).get("api")) ||
    "https://script.google.com/macros/s/AKfycbw9NeMYaL-oQ6yAVjGEJDZ_zbKB6zOxhyLisWECsz0707LQO4EvZCzSJOx2vCp0mU3C/exec",
};

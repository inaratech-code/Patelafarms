// PWABuilder detection often expects /service-worker.js at the origin root.
// Delegate to the app's existing service worker implementation.
importScripts("/sw.js");


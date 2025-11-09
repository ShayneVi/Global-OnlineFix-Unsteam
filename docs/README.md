# ShayneVi Portfolio Website

This is a professional portfolio website showcasing gaming tools and utilities.

## 🌐 Live Website

To publish this website using GitHub Pages:

1. Go to your repository settings
2. Navigate to "Pages" section
3. Under "Source", select the `main` branch and `/docs` folder
4. Click "Save"
5. Your website will be available at: `https://shayneVi.github.io/Global-OnlineFix-Unsteam/`

## 📁 File Structure

```
docs/
├── index.html              # Main homepage
├── compatibility.html      # Compatibility list page
├── styles.css             # Main stylesheet
├── compatibility.css      # Compatibility page styles
├── script.js              # Main JavaScript
├── compatibility.js       # Compatibility page logic
├── compatibility-data-sample.json  # Sample data structure
└── README.md             # This file
```

## 🎨 Features

- **Responsive Design**: Works on all devices
- **Modern UI**: Clean, professional interface with smooth animations
- **App Showcase**: Display all your gaming tools with descriptions
- **Compatibility Database**: Interactive table for game compatibility
- **Search & Filter**: Easy navigation of compatibility data
- **GitHub Integration**: Direct links to repositories

## 📊 Adding Compatibility Data

### Option 1: JSON Format (Recommended)

Create a file named `compatibility-data.json` in the `docs/` folder:

```json
[
  {
    "name": "Game Name",
    "appId": "123456",
    "unsteam": {
      "status": "works",
      "notes": "Optional notes"
    },
    "goldberg": {
      "status": "works",
      "notes": "Optional notes"
    },
    "steamless": {
      "status": "not-needed",
      "notes": "Optional notes"
    },
    "lastTested": "2025-11-09",
    "testedBy": "community"
  }
]
```

**Status Options:**
- `works` - Fully compatible
- `partial` - Some features may not work
- `not-needed` - Tool not required for this game
- `fails` - Does not work
- `untested` - Not yet verified

### Option 2: XML Format

Create a file named `compatibility-data.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<games>
  <game>
    <name>Game Name</name>
    <appId>123456</appId>
    <unsteam>
      <status>works</status>
      <notes>Optional notes</notes>
    </unsteam>
    <goldberg>
      <status>works</status>
      <notes>Optional notes</notes>
    </goldberg>
    <steamless>
      <status>not-needed</status>
      <notes>Optional notes</notes>
    </steamless>
    <lastTested>2025-11-09</lastTested>
  </game>
</games>
```

Then update `compatibility.js` line 26 to load XML:
```javascript
loadFromXML('compatibility-data.xml');
```

## 🔗 Updating Links

To add or modify app links, edit `index.html` and update the app cards in the "Apps Section".

## 🎯 Customization

### Colors

Edit CSS variables in `styles.css`:
```css
:root {
    --primary: #667eea;
    --secondary: #764ba2;
    --accent: #f093fb;
    /* ... */
}
```

### Content

- **Hero Section**: Edit the title and subtitle in `index.html` (lines 32-34)
- **App Cards**: Update app descriptions in the `.app-card` divs
- **Footer**: Modify footer content at the bottom of `index.html`

## 🚀 Testing Locally

To test the website locally:

1. Simply open `index.html` in your browser, or
2. Use a local server:
   ```bash
   # Python 3
   python -m http.server 8000

   # Python 2
   python -m SimpleHTTPServer 8000

   # Node.js (with http-server)
   npx http-server
   ```

3. Navigate to `http://localhost:8000`

## 📱 Responsive Breakpoints

- Desktop: > 768px
- Tablet: 768px
- Mobile: < 480px

## ✨ Easter Egg

Try the Konami code on the homepage: ↑ ↑ ↓ ↓ ← → ← → B A

## 📄 License

This website is part of the Global-OnlineFix-Unsteam project and follows the same license.

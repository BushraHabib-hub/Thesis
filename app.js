const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const main = require('./main');
const archiver = require('archiver');
const path = require('path');

const app = express();
const port = 3500;

app.use(bodyParser.urlencoded({extended:true}));
app.use(express.json()); // Add this line to parse JSON payloads

app.get('/', (req, res) => {
  fs.readFile('./index.html', 'utf-8', (err,data) => {
    if(err){
        console.error(err);
        return;
    }

    // data = data.replace('<!--FUNCTIONS-->',functionList(main.list()));
    res.send(data);    
  });  
});

app.get('/functionDetails', (req, res) => {
  fs.readFile('./functionDetails.html', 'utf-8', (err,data) => {
    if(err){
        console.error(err);
        return;
    }

    // data = data.replace('<!--FUNCTIONS-->',functionList(main.list()));
    res.send(data);    
  });  
});

app.get('/compare', (req, res) => {
  fs.readFile('./compare.html', 'utf-8', (err,data) => {
    if(err){
        console.error(err)
        return;
    }
    data = data.replace('<!--JS-->',main.body(req.query['fun']));
    data = data.replace('FNAME',req.query['fun']);
    res.send(data);    
  });  
});

app.post('/generate', async (req, res) => {
  // Log the received JS file name, preview, and full content for debugging
  if (req.body.jsFileName && req.body.jsFileContent) {
    const preview = req.body.jsFileContent.substring(0, 200) + (req.body.jsFileContent.length > 200 ? '...' : '');
    console.log(`✅ JS file received: ${req.body.jsFileName}`);
    console.log(`Preview: ${preview}`);
    console.log('Full JS file content:');
    console.log(req.body.jsFileContent);
  }

  // Process the WebAssembly compilation
  const result = await main.process(req.body['fname'], req.body['fname'] + '.wasm', req.body['wasm']);
  
  // NEW APPROACH: Use the custom package creator with direct file creation
  // Import the package creator
  const packageCreator = require('./create-package');
  let zipFilePath = null;
  
  if (result && req.body.jsFileContent && req.body.jsFileName) {
    try {
      console.log(`Creating WebAssembly-integrated JS file for function: ${req.body['fname']}`);
      modifiedJsFilePath = await main.createModifiedJSFile(req.body['fname'], req.body.jsFileContent);
      
      if (modifiedJsFilePath) {
        console.log(`Successfully created modified JS file: ${modifiedJsFilePath}`);
        
        // Verify file exists and get its content
        if (fs.existsSync(modifiedJsFilePath)) {
          console.log(`Verified: Modified JS file exists at path: ${modifiedJsFilePath}`);
          modifiedJsContent = fs.readFileSync(modifiedJsFilePath, 'utf8');
          console.log(`File size: ${modifiedJsContent.length} bytes`);
          console.log(`File preview: ${modifiedJsContent.substring(0, 100)}...`);
          
          // DIRECTLY create the file in the pkg directory
          const pkgDir = path.join(result);
          console.log(`Package directory: ${pkgDir}`);
          
          // List files in the pkg directory to debug
          console.log('Files in pkg directory:');
          fs.readdirSync(pkgDir).forEach(file => {
            console.log(`- ${file}`);
          });
          
          // Write file directly to pkg directory
          const destFile = path.join(pkgDir, `${req.body['fname']}_modified.js`);
          fs.writeFileSync(destFile, modifiedJsContent);
          console.log(`Directly wrote modified JS file to pkg directory: ${destFile}`);
          
          // Also create a version with the original filename if provided
          if (req.body.jsFileName) {
            const originalNameFile = path.join(pkgDir, req.body.jsFileName);
            fs.writeFileSync(originalNameFile, modifiedJsContent);
            console.log(`Also wrote file with original name: ${originalNameFile}`);
          }
          
          // Double-check the file exists
          if (fs.existsSync(destFile)) {
            console.log(`Verified: Modified JS file exists in pkg directory`);
          } else {
            console.error(`ERROR: Failed to create file in pkg directory`);
          }
        } else {
          console.error(`ERROR: Modified JS file not found at path: ${modifiedJsFilePath}`);
        }
      } else {
        console.error(`Failed to create modified JS file, returned null path`);
      }
    } catch (error) {
      console.error('Error creating modified JS file:', error);
    }
  }
  
  if (result) {
    try {
      const pkgPath = result;
      const zipFileName = `${req.body['fname']}_package.zip`;
      const zipFilePath = path.join(__dirname, zipFileName);
      
      // Create a file to stream archive data to
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });
      
      // Listen for all archive data to be written
      output.on('close', function() {
        console.log(`Archive created: ${archive.pointer()} total bytes`);
        
        // Send the zip file as a download
        res.download(zipFilePath, zipFileName, (err) => {
          if (err) {
            console.error('Error sending zip file:', err);
          }
          
          // Delete the zip file after sending it
          fs.unlink(zipFilePath, (unlinkErr) => {
            if (unlinkErr) console.error('Error deleting zip file:', unlinkErr);
          });
        });
      });
      
      // Handle archive warnings
      archive.on('warning', function(err) {
        if (err.code === 'ENOENT') {
          console.warn('Archive warning:', err);
        } else {
          console.error('Archive error:', err);
          throw err;
        }
      });
      
      // Handle archive errors
      archive.on('error', function(err) {
        console.error('Archive error:', err);
        res.status(500).send('Error creating package archive');
        throw err;
      });
      
      // Pipe archive data to the file
      archive.pipe(output);
        // Append files from the package directory
      archive.directory(pkgPath, false);      // Add the modified JavaScript file if it exists - no longer needed as we're putting it directly in pkg dir
      // The following code is for debugging purposes mainly
      console.log('--------------------------------');
      console.log('FILES IN PACKAGE DIRECTORY (before archiving):');
      const pkgFiles = fs.readdirSync(pkgPath);
      pkgFiles.forEach(file => {
        const fileStat = fs.statSync(path.join(pkgPath, file));
        console.log(`- ${file} (${fileStat.size} bytes)`);
      });
      console.log('--------------------------------');
      
      // Check for specific modified JS files
      const modifiedJsFile = path.join(pkgPath, `${req.body['fname']}_modified.js`);
      if (fs.existsSync(modifiedJsFile)) {
        console.log(`FOUND modified JS file in pkg dir: ${modifiedJsFile}`);
      } else {
        console.log(`Modified JS file NOT found in pkg dir: ${modifiedJsFile}`);
        // If we have content, try writing it one more time
        if (modifiedJsContent) {
          try {
            fs.writeFileSync(modifiedJsFile, modifiedJsContent);
            console.log(`Created modified JS file in pkg dir as last resort: ${modifiedJsFile}`);
          } catch (lastError) {
            console.error(`Final attempt to create modified JS file failed:`, lastError);
          }
        }
      }
      
      // If original file name provided, check that too
      if (req.body.jsFileName) {
        const originalFile = path.join(pkgPath, req.body.jsFileName);
        if (fs.existsSync(originalFile)) {
          console.log(`FOUND original named JS file in pkg dir: ${originalFile}`);
        } else {
          console.log(`Original named JS file NOT found in pkg dir: ${originalFile}`);
          // If we have content, try writing it one more time
          if (modifiedJsContent) {
            try {
              fs.writeFileSync(originalFile, modifiedJsContent);
              console.log(`Created original named JS file in pkg dir as last resort: ${originalFile}`);
            } catch (lastError) {
              console.error(`Final attempt to create original named JS file failed:`, lastError);
            }
          }
        }
      }
      
      // Create a simple HTML example that demonstrates using the WebAssembly module
      const exampleHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WebAssembly Example - ${req.body['fname']}</title>
</head>
<body>
  <h1>WebAssembly Function: ${req.body['fname']}</h1>
  <p>Open the browser console to see the results.</p>
  
  <script type="module">
    import init, { ${req.body['fname']} } from './${req.body['fname']}.js';
    
    async function run() {
      await init();
      console.log("WebAssembly module initialized");
      
      try {
        // Example call with sample parameters - modify as needed
        const result = ${req.body['fname']}(/* add appropriate parameters here */);
        console.log("WebAssembly function result:", result);
      } catch(e) {
        console.error("Error calling WebAssembly function:", e);
      }
    }
    
    run();
  </script>
</body>
</html>`;
      
      // archive.append(exampleHtml, { name: 'example.html' });
        // Create a README file with instructions
      const readmeContent = `# WebAssembly Implementation of ${req.body['fname']}

This package contains:

1. WebAssembly module compiled from Rust (${req.body['fname']}_bg.wasm)
2. JavaScript bindings to the WebAssembly module (${req.body['fname']}.js)
3. Modified original JavaScript file with WebAssembly integration (${req.body['fname']}_modified.js)
4. Example HTML file showing basic usage (example.html)

## Usage

### Method 1: Using the modified JavaScript file
Simply replace your original JS file with ${req.body['fname']}_modified.js.
This file automatically loads the WebAssembly module and replaces the ${req.body['fname']} function with the WebAssembly version.

### Method 2: Direct WebAssembly import
For more control, use the WebAssembly module directly:

\`\`\`javascript
import init, { ${req.body['fname']} } from './${req.body['fname']}.js';

async function run() {
  await init();
  // Now you can call the function
  const result = ${req.body['fname']}(/* parameters */);
}

run();
\`\`\`

## Performance
The WebAssembly version should offer better performance for computationally intensive tasks.
`;
      
      // archive.append(readmeContent, { name: 'README.md' });
      
      // Final check: add any missing files directly to the archive
      console.log('FINAL CHECK: Adding files directly to the archive if needed');
      
      // Add modified JS file directly to the archive if needed
      // if (modifiedJsContent) {
      //   // Add with modified filename
      //   archive.append(modifiedJsContent, { name: `${req.body['fname']}_modified.js` });
      //   console.log(`Added ${req.body['fname']}_modified.js directly to archive`);
        
      //   // // Add with original filename if provided
      //   // if (req.body.jsFileName) {
      //   //   archive.append(modifiedJsContent, { name: req.body.jsFileName });
      //   //   console.log(`Added original filename ${req.body.jsFileName} directly to archive`);
      //   // }
      // }
      
      // Finalize the archive (i.e., we are done appending files)
      archive.finalize();
      
    } catch (error) {
      console.error('Error creating downloadable package:', error);
      res.status(500).send('Error creating downloadable package');
    }
  } else {
    res.status(500).send('Code generation failed');
  }
})

app.listen(port, () => {
  console.log(`WASM app listening on port ${port}`)
});

function functionList(lst){  
  var html = '';
  for(fun in lst){
    html += '<li><a href="/compare?fun=' + lst[fun] +'">' + lst[fun] +'</a></li>';
  }

  return html
}

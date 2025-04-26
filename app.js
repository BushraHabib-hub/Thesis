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
  const result = await main.process(req.body['fname'], req.body['fname'] + '.wasm', req.body['wasm']);
  
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
      archive.directory(pkgPath, false);
      
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

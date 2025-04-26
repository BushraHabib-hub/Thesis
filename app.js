const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const main = require('./main');

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

app.post('/generate', (req, res) => {
  if (main.process(req.body['fname'],req.body['fname'] + '.wasm',req.body['wasm']) ){
    res.send('code generated successfully <br/> <a href="/">List</a>');
  }
  else{
    res.send('code generation failed <br/> <a href="/">List</a>');
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

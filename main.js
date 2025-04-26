const { exec } = require('child_process');
const fs = require('fs');

function executeCommand(cmd){
    promise = new Promise( (resolve,reject) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                reject(stderr);                
                return;
            }      
            
            resolve(stdout);                    
        });        
    });
    
    return promise.then( (result) => {console.log(result); console.log("command successful");},
                         (result) => {console.log(result)} );                      
}

function process(foldername, filename, code) {
    return executeCommand("cargo new " + foldername + " --lib").then(() => {
        const filePath = `${foldername}/src/lib.rs`;
        fs.writeFile(filePath, code, err => {
            if (err) {
                console.error(err);
                return false;
            }
            console.log(`File written to ${filePath}`);
            return true;
        });
    });
}

function list(){
    var data = require('./functions.json');
    var names = [];
    for (obj in data){        
        names[names.length] = obj ;
    }
    return names;
}

function body(fun){
    var data = require('./functions.json');    
    return data[fun].body;
}

module.exports = {process,list,body}
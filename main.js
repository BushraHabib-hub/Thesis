const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');
const writeFileAsync = util.promisify(fs.writeFile);

function executeCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                console.log(stderr);
                reject(stderr);                
                return;
            }      
            
            console.log(stdout);
            console.log("command successful");
            resolve(stdout);                    
        });        
    });
}
async function writeCodeToLib(filePath, code) {
    try {
        await writeFileAsync(filePath, code);
        console.log(`File written to ${filePath}`);
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}
async function addDepsToCargo(foldername) {
    try {
        const cargoPath = `${foldername}/Cargo.toml`;
        const data = await fs.promises.readFile(cargoPath, 'utf-8');
        const lines = data.split('\n');

        let dependenciesFound = false;
        let libFound = false;
        let modifiedLines = [];
        
        for (let i = 0; i < lines.length; i++) {
            modifiedLines.push(lines[i]);
            
            if (lines[i].trim() === '[dependencies]') {
                dependenciesFound = true;
                // Add dependencies if the section is found
                modifiedLines.push('wasm-bindgen = "0.2"');
                // modifiedLines.push('serde = { version = "1.0", features = ["derive"] }');
                // modifiedLines.push('serde_json = "1.0"');
                // modifiedLines.push('serde-wasm-bindgen = "0.5"');
            } else if (lines[i].trim() === '[lib]') {
                libFound = true;
                modifiedLines.push('crate-type = ["cdylib", "rlib"]');
            }
        }
        
        if (!libFound) {
            modifiedLines.push('');
            modifiedLines.push('[lib]');
            modifiedLines.push('crate-type = ["cdylib", "rlib"]');
        }
        
        const updatedContent = modifiedLines.join('\n');
        await fs.promises.writeFile(cargoPath, updatedContent, 'utf-8');
        console.log(`Updated ${cargoPath} with dependencies and lib configuration`);
        return true;
    } catch (err) {
        console.error(`Error updating ${cargoPath}:`, err);
        return false;
    }
}
async function process(foldername, filename, code) {
    try {
        await executeCommand("cargo new " + foldername + " --lib");
        const filePath = `${foldername}/src/lib.rs`;
        await writeCodeToLib(filePath, code);
        await addDepsToCargo(foldername);
        
        // Check if wasm32 target is installed, if not install it
        try {
            console.log("Checking for web");
            await executeCommand("rustup target list --installed | findstr web");
        } catch (e) {
            console.log("web target not found, installing...");
            await executeCommand("rustup target add web");
        }
        
        // Add compilation step
        console.log("Building WebAssembly module...");
        // Change to the project directory and build it
        await executeCommand(`cd ${foldername} && wasm-pack   build --target web`);
        console.log("WebAssembly module built successfully");
        
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
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
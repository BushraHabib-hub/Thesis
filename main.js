const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');
const path = require('path');
const writeFileAsync = util.promisify(fs.writeFile);
const mkdirAsync = util.promisify(fs.mkdir);

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
        // Create output directory if it doesn't exist
        const outputDir = path.join(__dirname, 'output');
        if (!fs.existsSync(outputDir)) {
            await mkdirAsync(outputDir);
            console.log(`Created output directory: ${outputDir}`);
        }
        
        // Set the full project path inside the output directory
        const fullFolderPath = path.join(outputDir, foldername);
        
        // Check if folder already exists and delete it if it does
        if (fs.existsSync(fullFolderPath)) {
            console.log(`Folder ${fullFolderPath} already exists. Deleting...`);
            await fs.promises.rm(fullFolderPath, { recursive: true, force: true });
            console.log(`Deleted existing folder ${fullFolderPath}`);
        }
        
        // Create new Rust project in the output directory
        await executeCommand(`cargo new ${fullFolderPath} --lib`);
        const filePath = path.join(fullFolderPath, 'src', 'lib.rs');
        await writeCodeToLib(filePath, code);
        await addDepsToCargo(fullFolderPath);
        
        // Add compilation step
        console.log("Building WebAssembly module...");
        // Change to the project directory and build it
        await executeCommand(`cd ${fullFolderPath} && wasm-pack build --target web`);
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
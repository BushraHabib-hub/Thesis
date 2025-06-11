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
async function process(foldername, filename, code, jsFileContent = null) {
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
        
        // Define pkg path
        const packageFolderPath = path.join(fullFolderPath, 'pkg');
        
        // After successful compilation, if we have JS content, create the modified file directly in pkg
        if (jsFileContent) {
            try {
                console.log(`Creating modified JS file directly in pkg directory...`);
                const modifiedFile = await createModifiedJSFile(foldername, jsFileContent);
                
                // Now manually copy the modified file to the pkg directory
                if (modifiedFile) {
                    const modifiedJsPath = path.join(packageFolderPath, `${foldername}_modified.js`);
                    const modifiedJsContent = fs.readFileSync(modifiedFile, 'utf8');
                    fs.writeFileSync(modifiedJsPath, modifiedJsContent);
                    console.log(`Successfully created modified file at: ${modifiedJsPath}`);
                    
                    // Verify file exists and has content
                    if (fs.existsSync(modifiedJsPath)) {
                        //console.log(`Verified: File exists at ${modifiedJsPath} (size: ${fs.statSync(modifiedJsPath).size} bytes)`);
                    }
                }
            } catch (jsError) {
                console.error('Error creating or copying modified JS file:', jsError);
            }
        }
        
        return packageFolderPath;
    } catch (error) {
        console.error(error);
        return false;
    }
}

// Create a modified JavaScript file that uses the WebAssembly function
async function createModifiedJSFile(functionName, originalCode) {
    try {
        console.log(`Creating modified JS file for function: ${functionName}`);
        //console.log(`Original code length: ${originalCode.length} characters`);
        
        // Parse the original function signature and body
        const funcRegex = new RegExp(`function\\s+${functionName}\\s*\\(([^)]*)\\)\\s*{([\\s\\S]*?)}\\s*$`, 'm');
        const match = originalCode.match(funcRegex);
        
        if (!match) {
            console.error(`Could not parse function ${functionName}`);
            console.log(`Original code: "${originalCode.substring(0, 100)}..."`);
            return null;
        }
        
        // Get the function parameters
        const params = match[1].split(',').map(param => param.trim());
        
        // Create the modified JavaScript file content
        let modifiedJS = `// Original file with WebAssembly integration for function: ${functionName}
// Generated on ${new Date().toISOString()}

// WebAssembly module initialization
let wasmModule;
async function initWasm() {
    try {
        const imports = {};
        if (wasmModule) return;
        
        // In a real application, adjust this import path to your actual file location
        const module = await import('./${functionName}.js');
        wasmModule = module;
        await module.default();
        console.log("WebAssembly module loaded successfully");
    } catch (err) {
        console.error("Failed to load WebAssembly module:", err);
    }
}

// Initialize WebAssembly when the file loads
initWasm();

// Original code with ${functionName} replaced by WebAssembly version
${originalCode.replace(
    funcRegex, 
    `function ${functionName}(${match[1]}) {
    // This function is implemented in WebAssembly for better performance
    if (wasmModule) {
        try {
            return wasmModule.${functionName}(${params.join(', ')});
        } catch (err) {
            console.error("WebAssembly call failed:", err);
            // Fall back to original implementation if WebAssembly fails
        }
    }
    
    // Original implementation as fallback
    ${match[2]}
}`
)}
`;        // Write the modified JS file directly in both locations:
        // 1. In the output folder
        const outputDir = path.join(__dirname, 'output', functionName);
        if (!fs.existsSync(outputDir)) {
            await fs.promises.mkdir(outputDir, { recursive: true });
            console.log(`Created function-specific output directory: ${outputDir}`);
        }
        
        // 2. In the pkg directory (which will be zipped)
        const pkgDir = path.join(outputDir, 'pkg');
        if (!fs.existsSync(pkgDir)) {
            console.log(`pkg directory doesn't exist yet, will write file to output directory first`);
        }
        
        // Create output file paths
        const outputFile = path.join(outputDir, `${functionName}_modified.js`);
        const pkgOutputFile = path.join(pkgDir, `${functionName}_modified.js`);
        
        // Write to output directory
        await writeFileAsync(outputFile, modifiedJS);
        console.log(`Modified JavaScript file created at ${outputFile}`);
        
        // If pkg directory exists, also write there directly
        if (fs.existsSync(pkgDir)) {
            try {
                await writeFileAsync(pkgOutputFile, modifiedJS);
                //console.log(`Modified JavaScript file also created at ${pkgOutputFile} (for ZIP inclusion)`);
            } catch (pkgWriteErr) {
                console.error(`Error writing to pkg directory:`, pkgWriteErr);
            }
        }
        
        // Verify file was written correctly
        if (fs.existsSync(outputFile)) {
            console.log(`Verified: File exists at ${outputFile} (size: ${fs.statSync(outputFile).size} bytes)`);
            return path.resolve(outputFile); // Return absolute path
        } else {
            console.error(`Failed to create file at ${outputFile}`);
            return null;
        }
    } catch (error) {
        console.error("Error creating modified JS file:", error);
        return null;
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

// Only export functions once
module.exports = {
    list,
    body,
    process,
    createModifiedJSFile
};
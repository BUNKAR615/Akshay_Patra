const fs = require('fs');
const path = require('path');

function getRelativePath(fromFile, toAlias) {
    const rootDir = process.cwd();
    // fromFile: C:\...\app\api\auth\route.js
    // toAlias: @/lib/prisma -> lib/prisma
    
    // 1. Get absolute path of target
    const targetPath = path.join(rootDir, toAlias.replace('@/', ''));
    
    // 2. Get relative path from dir of fromFile to targetPath
    let rel = path.relative(path.dirname(fromFile), targetPath);
    
    // 3. Format correctly
    rel = rel.replace(/\\/g, '/');
    if (!rel.startsWith('.')) {
        rel = './' + rel;
    }
    return rel;
}

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            
            // Match imports like: import ... from "@/lib/something"
            const regex = /from\s+['"]@\/(lib|components)\/([^'"]+)['"]/g;
            
            content = content.replace(regex, (match, folder, rest) => {
                const aliasPath = '@/' + folder + '/' + rest;
                const relPath = getRelativePath(fullPath, aliasPath);
                modified = true;
                return `from "${relPath}"`;
            });
            
            if (modified) {
                fs.writeFileSync(fullPath, content);
                console.log('Fixed:', fullPath);
            }
        }
    }
}

processDirectory(path.join(process.cwd(), 'app'));

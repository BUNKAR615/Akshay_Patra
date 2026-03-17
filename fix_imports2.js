const fs = require('fs');
const path = require('path');

function getRelativePath(fromFile, toAlias) {
    const rootDir = process.cwd();
    const targetPath = path.join(rootDir, toAlias.replace('@/', ''));
    let rel = path.relative(path.dirname(fromFile), targetPath);
    rel = rel.replace(/\\/g, '/');
    if (!rel.startsWith('.')) {
        rel = './' + rel;
    }
    return rel;
}

function processDirectory(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            
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

processDirectory(path.join(process.cwd(), 'components'));
processDirectory(path.join(process.cwd(), 'lib'));
processDirectory(path.join(process.cwd(), 'app')); // run once more just in case

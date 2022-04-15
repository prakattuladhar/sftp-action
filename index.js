const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

let Client = require('ssh2-sftp-client');
let sftp = new Client();

const host = core.getInput('host');
const port = parseInt(core.getInput('port'));
const username = core.getInput('username');
const password = core.getInput('password');
const agent = core.getInput('agent');
const privateKeyIsFile = core.getInput('privateKeyIsFile');
const passphrase = core.getInput('passphrase');

var privateKey = core.getInput('privateKey');

core.setSecret(password);
if (passphrase != undefined) {
    core.setSecret(passphrase);
}

if (privateKeyIsFile == "true") {
    var privateKey = fs.readFileSync(privateKey);
    core.setSecret(privateKey);
}

const localPath = core.getInput('localPath');
const remotePath = core.getInput('remotePath');
const additionalPaths = core.getInput('additionalPaths')
const exclude = core.getInput('exclude')

sftp.connect({
    host: host,
    port: port,
    username: username,
    password: password,
    agent: agent,
    privateKey: privateKey,
    passphrase: passphrase
}).then(async () => {
    console.log("Connection established.");
    console.log("Current working directory: " + await sftp.cwd())
    console.log("debug")
    console.log(additionalPaths)
    console.log("debug")
    console.log(exclude)


    const parsedAdditionalPaths = (() => {
        try {
            const parsedAdditionalPaths = JSON.parse(additionalPaths)
            return Object.entries(parsedAdditionalPaths)
        }
        catch (e) {
            throw "Error parsing addtionalPaths. Make sure it is a valid JSON object (key/ value pairs)."
        }
    })()
   
    const parsedExclude = (() => {
        try {
            return JSON.parse(exclude)
        }
        catch (e) {
            throw "Error parsing exlcude. Make sure it is a valid Array of strings."
        }
    })()

    await processPath(localPath, remotePath, parsedExclude) //TODO: Instead of localPath, remotePath use key/value to uplaod multiple files at once.

    for (const [local, remote] of parsedAdditionalPaths) {
        await processPath(local, remote, parsedExclude)
    }

}).then(() => {
    console.log("Upload finished.");
    return sftp.end();
}).catch(err => {
    core.setFailed(`Action failed with error ${err}`);
    process.exit(1);
});

async function processPath(local, remote, exclude = []) {
    console.log("Uploading: " + local + " to " + remote)

    if (fs.lstatSync(local).isDirectory()) {
        return sftp.uploadDir(local, remote, (path, isDir) => {
            console.log("Exclude path: " + path)
            return !exclude.includes(path)
        });
    } else {

        var directory = await sftp.realPath(path.dirname(remote));
        if (!(await sftp.exists(directory))) {
            await sftp.mkdir(directory, true);
            console.log("Created directories.");
        }

        var modifiedPath = remote;
        if (await sftp.exists(remote)) {
            if ((await sftp.stat(remote)).isDirectory) {
                var modifiedPath = modifiedPath + path.basename(local);
            }
        }

        return sftp.put(fs.createReadStream(local), modifiedPath);
    }
}
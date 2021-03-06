import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import * as mkc from "./mkc"

export function findProjectDir() {
    let s = process.cwd()
    while (true) {
        if (fs.existsSync(path.join(s, "pxt.json")))
            return s

        const s2 = path.resolve(path.join(s, ".."))
        if (s == s2)
            return null
        s = s2;
    }
}

const readAsync = util.promisify(fs.readFile)
const writeAsync = util.promisify(fs.writeFile)

export function readPrjFileAsync(dir: string, filename: string) {
    if (filename.indexOf("/") >= 0)
        return Promise.reject(new Error("Invalid file name"))
    return readAsync(path.join(dir, filename), "utf8")
}

export async function readProjectAsync(dir: string) {
    const pxtJson = await readAsync(path.join(dir, "pxt.json"), "utf8")
    const res: mkc.Package = {
        config: JSON.parse(pxtJson),
        mkcConfig: JSON.parse(await readAsync(path.join(dir, "mkc.json"), "utf8").then(s => s, err => "{}")),
        files: {
            "pxt.json": pxtJson
        }
    }
    for (let f of res.config.files.concat(res.config.testFiles || [])) {
        if (f.indexOf("/") >= 0)
            continue
        res.files[f] = await readAsync(path.join(dir, f), "utf8")
    }
    return res
}

function homePxtDir() {
    return path.join(process.env["HOME"] || process.env["UserProfile"], ".pxt")
}

export function mkHomeCache(dir?: string): mkc.Cache {
    if (!dir) dir = homePxtDir()
    mkdirp(dir)
    const rootPath = path.join(dir, "mkc-cache")
    mkdirp(rootPath)

    function expandKey(key: string) {
        return key.replace(/[^\.a-z0-9\-]/g, c => "_" + c.charCodeAt(0) + "_")
    }

    function keyPath(key: string) {
        return path.join(rootPath, expandKey(key))
    }

    return {
        rootPath,
        expandKey,
        getAsync: key => readAsync(keyPath(key)).then(buf => buf, err => null),
        setAsync: (key, val) => writeAsync(keyPath(key), val)
    }
}

function mkdirp(dirname: string, lev = 5) {
    if (!fs.existsSync(dirname)) {
        if (lev > 0)
            mkdirp(path.resolve(dirname, ".."), lev - 1)
        fs.mkdirSync(dirname)
    }
}

async function writeFilesAsync(built: string, outfiles: pxt.Map<string>, log = false) {
    mkdirp(built)
    for (let fn of Object.keys(outfiles)) {
        if (fn.indexOf("/") >= 0)
            continue
        if (log)
            console.log(`write ${built}/${fn}`)
        await writeAsync(path.join(built, fn), outfiles[fn])
    }
}

export async function saveBuiltFilesAsync(dir: string, res: mkc.service.CompileResult, folder = "built") {
    await writeFilesAsync(path.join(dir, folder), res.outfiles || {}, true)
}

export async function savePxtModulesAsync(dir: string, ws: mkc.Workspace) {
    const pxtmod = path.join(dir, "pxt_modules")
    mkdirp(pxtmod)
    for (let k of Object.keys(ws.packages)) {
        if (k == "this")
            continue
        await writeFilesAsync(path.join(pxtmod, k), ws.packages[k].files)
    }
}

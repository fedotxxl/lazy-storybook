import ts = require("typescript");
import {NamedDeclaration, SourceFile} from "typescript";
import glob from "glob";
import {resolve} from "path";
import {Block} from "comment-parser/src/primitives";
import {Spec} from "comment-parser/es6/primitives";
import * as fs from "fs";
import Handlebars = require("handlebars");
const { parse } = require('comment-parser/lib');
import { v4 as uuidv4 } from 'uuid';

function run(config: {path: string, buildDir: string}) {
    type Component = {
        name: string,
        description: string,
        link: string,
        img: string
    }

    const templateHbs = fs.readFileSync('template.hbs','utf8');
    const template = Handlebars.compile(templateHbs);

    const copyFile = (source: string, target: string): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
            fs.copyFile(source, target, (err) => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            })
        })
    };

    const buildFilePath = (path: string): string => {
        return `./${config.buildDir}/${path}`
    };

    const extractComponent = (sourceFile: SourceFile, node: ts.Node, commentBlocks: Block[]): Component => {
        const comment = commentBlocks[0];

        if (comment) {
            let lsComponent: Spec = null;
            let lsLink: Spec = null;
            let lsImg: Spec = null;

            comment.tags.forEach((tag: Spec) => {
                switch (tag.tag) {
                    case "lsComponent":
                        lsComponent = tag;
                        break;
                    case "lsLink":
                        lsLink = tag;
                        break;
                    case "lsImg":
                        lsImg = tag;
                        break;
                }
            });

            if (lsComponent) {
                const name = lsComponent.name || (node as any).name?.escapedText;

                if (name) {
                    const imgPath = (lsImg) ? lsImg.name || `./${name}.png` : null;
                    const imgPathAbsolute = resolve(sourceFile.fileName, "..", imgPath);

                    return {
                        name: name,
                        description: lsComponent.description,
                        img: imgPathAbsolute,
                        link: lsLink?.name,
                    }
                }
            }
        }

        return null;
    }

    glob(config.path, async (er: any, files: string[]) => {
        const components: Component[] = [];
        const filesResolved: string[] = files.map(file => resolve(file));

        const comments: string[] = [];
        let program = ts.createProgram(files, {
            target: ts.ScriptTarget.Latest, module: ts.ModuleKind.None, removeComments: false
        });

        for (let sourceFile of program.getSourceFiles()) {
            if (filesResolved.includes(resolve(sourceFile.fileName))) {
                ts.forEachChild(sourceFile, node => {
                    comments.push(...visit(sourceFile, node))
                });
            }
        }

        function visit(sourceFile: SourceFile, node: ts.Node) {
            const answer: string[] = [];

            const commentRanges = ts.getLeadingCommentRanges(sourceFile.getFullText(), node.getFullStart());

            if (commentRanges?.length) {
                const comments = commentRanges.map(r => parse(sourceFile.getFullText().slice(r.pos, r.end), {spacing: "preserve"}));

                comments.forEach(comment => {
                    const component = extractComponent(sourceFile, node, comment);

                    if (component) {
                        components.push(component)
                    }
                })
            }

            return answer;
        }

        await Promise.all(
            components.map(component => {
                if (component.img) {
                    const filePath = `generated/img/${uuidv4()}.png`;

                    return copyFile(component.img, buildFilePath(filePath)).then(r => {
                        component.img = filePath;
                    })
                }
            })
        );

        console.log(JSON.stringify(components))

        fs.writeFile(buildFilePath("index.html"), template({components: components}),  function(err) {
            if (err) {
                return console.error(err);
            }
            console.log("File created!");
        });

    });
}

run({path: "./src/**/*.tsx", buildDir: "build"});

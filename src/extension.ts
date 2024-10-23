
import { Console, log } from 'console';
import * as vscode from 'vscode';

let isSorted = false;
let filterText = '';

export function activate(context: vscode.ExtensionContext) {

	// Register commands
	const showFunctionList = vscode.commands.registerCommand('sidebar-function-list.showFunctionList', () => {
		moveViewToSecondarySideBar();
		vscode.window.showInformationMessage('Show Function List command executed');
    });

	const navigateToFunction = vscode.commands.registerCommand('sidebar-function-list.navigateToFunction', (range: vscode.Range) => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.selection = new vscode.Selection(range.start, range.start);
            editor.revealRange(range);
        }
    });

	const sortFunctionList = vscode.commands.registerCommand('sidebar-function-list.sortFunctionList', () => {
		isSorted = !isSorted;
		treeDataProvider.refresh();
		vscode.window.showInformationMessage(`Function list ${isSorted ? 'sorted' : 'unsorted'}`);
	});

	const showFilterBox = vscode.commands.registerCommand('sidebar-function-list.showFilterBox', () => {
        filterText = '';
		treeDataProvider.refresh();
		
		const inputBox = vscode.window.createInputBox();
        inputBox.prompt = 'Type to filter functions';
        inputBox.onDidChangeValue(value => {
            filterText = value;
            treeDataProvider.refresh();
        });
        inputBox.onDidAccept(() => {
            inputBox.hide();
        });
        inputBox.show();
    });

    context.subscriptions.push(showFilterBox);

    context.subscriptions.push(showFunctionList);
    context.subscriptions.push(navigateToFunction);
	context.subscriptions.push(sortFunctionList);

	// Register function list view
    const treeDataProvider = new FunctionListTreeDataProvider();
    
    vscode.window.registerTreeDataProvider('functionListView', treeDataProvider);


	// Show the function list at the sidebar
	const moveViewToSecondarySideBar = async () => {
        try {
			await vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar');

            setTimeout(async () => {
                await vscode.commands.executeCommand('workbench.action.moveView', {
                    viewId: 'functionListView',
                    destination: 'workbench.view.extension.secondarySidebar'
                });
            }, 100);
        } catch (err) {
            console.error('Error moving view to secondary side bar:', err);
        }
    };

	// Save listener to refresh the function list
    vscode.workspace.onWillSaveTextDocument(() => {
        treeDataProvider.refresh(); // Refresca la vista de funciones
    });

	// Change active file listener to refresh the function list
	vscode.window.onDidChangeActiveTextEditor(() => {
        treeDataProvider.refresh();
    });
}

class FunctionListTreeDataProvider implements vscode.TreeDataProvider<FunctionItem> {
    
    private _onDidChangeTreeData: vscode.EventEmitter<FunctionItem | undefined | null | void> = new vscode.EventEmitter<FunctionItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FunctionItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FunctionItem): vscode.TreeItem {
        // Navigate to function on click event
        const command: vscode.Command = {
            command: 'sidebar-function-list.navigateToFunction',
            title: 'Go to Function',
            arguments: [element.range]
        };
        element.command = command;
        return element;
    }

    getChildren(element?: FunctionItem): Thenable<FunctionItem[]> {

		if (!vscode.window.activeTextEditor) {
        	return Promise.resolve([]);
		}

		if (!element) {
			const text = vscode.window.activeTextEditor.document.getText();
			const functions = this.getFunctions(text);

			//sort list
			if (isSorted) {
				functions.sort((a, b) => a.label.localeCompare(b.label));
			}

			//filter list
			const filteredFunctions = functions.filter(func => func.label.toLowerCase().includes(filterText.toLowerCase()));


			return Promise.resolve(filteredFunctions);
		}

		return Promise.resolve(element.children);
    }

    private getFunctions(code: string, originalStartIndex = 0): FunctionItem[] {
		
		// Detect the file language
		const languageId = vscode.window.activeTextEditor?.document.languageId;
		let functionRegex: RegExp;

		if (languageId === 'python') {
			// Python function regex
			functionRegex = /^[\t \w]*def\s+(\w+)\s*\(([^)]*)\)\s*:/gm;
		} else {
			// Default regex for other languages (e.g., JavaScript, TypeScript)
			functionRegex = /\bfunction\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
		}

		let matches;
		const functions: FunctionItem[] = [];

		if (!vscode.window.activeTextEditor) {
			return functions;
		}
	
		let lastEnd = 0;
		var initial_level = 0;

		while ((matches = functionRegex.exec(code)) !== null) {
			const startIndex = matches.index;
			if (lastEnd > startIndex) {
				continue;
			}
			let endIndex = 0;
			if (vscode.window.activeTextEditor.document.languageId === 'python') {
				// Python
				if (endIndex == 0) {
					initial_level = this.getIndentationLevel(code.substring(code.lastIndexOf('\n', startIndex) + 1, code.indexOf('\n',startIndex))); // Cambiado para obtener el nivel de indentación al inicio de la línea
				}
				endIndex = code.indexOf('\n', startIndex);
				if (endIndex === -1) {
					endIndex = code.length;
				}
				let level = initial_level + 1;
				while (level > initial_level && endIndex < code.length) {
					endIndex = code.indexOf('\n', endIndex + 1) + 1;
					if (endIndex === -1) {
						endIndex = code.length;
						break;
					}
					level = this.getIndentationLevel(code.substring(endIndex, code.indexOf('\n', endIndex)));
				}

			} else {
				// Other languages
				let braceCount = 1;
				endIndex = startIndex + matches[0].length;
				while (endIndex < code.length && braceCount > 0) {
					if (code[endIndex] === '{') {
						braceCount++;
					} else if (code[endIndex] === '}') {
						braceCount--;
					}
					endIndex++;
				}
			}
	
			// Add function to the list
			
			lastEnd = endIndex;

			const functionName = matches[1];

			const range = new vscode.Range(
				vscode.window.activeTextEditor.document.positionAt(startIndex + originalStartIndex), 
				vscode.window.activeTextEditor.document.positionAt(endIndex - 1 + originalStartIndex)
			);

			const functionItem: FunctionItem = {
				label: functionName,
				collapsibleState: vscode.TreeItemCollapsibleState.None,
				range: range,
				children: this.getFunctions(code.substring(startIndex + matches[0].length, endIndex - 1), startIndex + matches[0].length + originalStartIndex) // Find inner functions recursively
			};

			if (functionItem.children.length > 0) {
				functionItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
			}

			functions.push(functionItem);
			
		}
	
		return functions;
	}

	// Función auxiliar para obtener el nivel de indentación
	private getIndentationLevel(line: string): number {
		return line.match(/^\s*/)?.[0].length || 0;
	}
}


class FunctionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly range: vscode.Range,
        public readonly children: FunctionItem[] = []
    ) {
        super(label, collapsibleState);
    }
}

export function deactivate() {}

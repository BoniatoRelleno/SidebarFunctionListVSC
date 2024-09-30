
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	// Register commands
	const showFunctionList = vscode.commands.registerCommand('sidebar-function-list.showFunctionList', () => {
		moveViewToSecondarySideBar();
		vscode.window.showInformationMessage('Show Function List command executed');
    });

	const navigateToFunction = vscode.commands.registerCommand('sidebar-function-list.navigateToFunction', (range: vscode.Range) => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.selection = new vscode.Selection(range.start, range.start); // Mueve el cursor al inicio de la función
            editor.revealRange(range); // Revela el rango de la función en el editor
        }
    });

    context.subscriptions.push(showFunctionList);
    context.subscriptions.push(navigateToFunction);

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
			return Promise.resolve(this.getFunctions(text));
		}

		return Promise.resolve(element.children);
    }

    private getFunctions(code: string, originalStartIndex = 0): FunctionItem[] {
		
		const functionRegex = /\bfunction\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
		let matches;
		const functions: FunctionItem[] = [];

		if (!vscode.window.activeTextEditor) {
			return functions;
		}
	
		let lastEnd = 0;

		while ((matches = functionRegex.exec(code)) !== null) {
			const startIndex = matches.index;
			if (lastEnd > startIndex) {
				continue;
			}
			let braceCount = 1;
			let endIndex = startIndex + matches[0].length;
	
			// Find function end
			while (endIndex < code.length && braceCount > 0) {
				if (code[endIndex] === '{') {
					braceCount++;
				} else if (code[endIndex] === '}') {
					braceCount--;
				}
				endIndex++;
			}
	
			// Add function to the list
			if (braceCount === 0) {

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
					children: this.getFunctions(code.substring(startIndex + matches[0].length,endIndex - 1), startIndex + matches[0].length + originalStartIndex) //find inner functions recursively
				};

				if (functionItem.children.length > 0) {
                    functionItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                }

				functions.push(functionItem);
			}
		}
	
		return functions;
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

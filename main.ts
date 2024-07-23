import { App, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, ItemView, Menu, normalizePath } from 'obsidian';

interface ImageGridViewerSettings {
	mySetting: string;
	maxColumns: number;
	maxRows: number;
	flexDirection: string;
}

const DEFAULT_SETTINGS: ImageGridViewerSettings = {
	mySetting: 'default',
	maxColumns: 4,
	maxRows: 4,
	flexDirection: 'row'
};

export default class ImageGridViewerPlugin extends Plugin {
	settings: ImageGridViewerSettings;
	imageGridLeaf: WorkspaceLeaf | null = null;

	async onload() {
		console.log('Loading Image Grid Viewer Plugin');

		await this.loadSettings();

		this.registerView('image-grid-viewer', leaf => new ImageGridViewerView(leaf, this.settings, this));

		this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, view) => {
			this.addImageContextMenu(menu, editor.getSelection(), view?.file?.path as string);
		}));

		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
			if (file instanceof TFile && ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(file.extension)) {
				console.log(file.path);
				console.log(this.getAbsolutePath(file));
				menu.addItem((item) => {
					item.setTitle('Show Image in Grid View')
						.setIcon('image-file')
						.onClick(() => this.showImageView(file.path));
				});
			}
		}));

		this.addSettingTab(new ImageGridViewerSettingTab(this.app, this));
	}

	onunload() {
		console.log('Unloading Image Grid Viewer Plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async getAbsolutePath(file: TFile): Promise<string> {
		const resourcePath = this.app.vault.getResourcePath(file);
		const absolutePath = decodeURI(resourcePath.replace(/^app:\/\//, ''));
		console.log('Absolute Path:', absolutePath);
		return absolutePath;
	}

	addImageContextMenu(menu: Menu, selectedText: string, currentFilePath: string) {
		if (selectedText && (selectedText.match(/!\[.*\]\(.*\)/) || selectedText.match(/!\[\[.*\]\]/))) { // Match both markdown image and wikilink image
			const match = selectedText.match(/\((.*?)\)/) || selectedText.match(/\[\[(.*?)\]\]/);
			if (match) {
				let imagePath = match[1];
				if (!imagePath.match(/^(https?:\/\/|data:image\/)/)) {
					imagePath = this.resolveImagePath(imagePath, currentFilePath);
				}
				menu.addItem((item) => {
					item.setTitle('Show Image in Grid View')
						.setIcon('image-file')
						.onClick(() => this.showImageView(imagePath));
				});
			}
		}
	}

	resolveImagePath(imagePath: string, currentFilePath: string): string {
		if (imagePath.startsWith('/')) {
			return imagePath;
		}
		return normalizePath(this.app.vault.getAbstractFileByPath(currentFilePath)?.parent?.path + '/' + imagePath);
	}

	async showImageView(imagePath: string) {
		if (this.imageGridLeaf && this.imageGridLeaf.view instanceof ImageGridViewerView) {
			const view = this.imageGridLeaf.view as ImageGridViewerView;
			view.addImage(imagePath);
		} else {
			const leaf = this.app.workspace.getLeaf(true);
			this.imageGridLeaf = leaf;
			await leaf.setViewState({
				type: 'image-grid-viewer',
				state: { files: [imagePath] }
			});
			const view = leaf.view as ImageGridViewerView;
			if (view instanceof ImageGridViewerView) {
				view.addImage(imagePath);
			}
		}
	}
}

class ImageGridViewerView extends ItemView {
	images: string[];
	settings: ImageGridViewerSettings;
	plugin: ImageGridViewerPlugin;

	constructor(leaf: WorkspaceLeaf, settings: ImageGridViewerSettings, plugin: ImageGridViewerPlugin) {
		super(leaf);
		this.images = [];
		this.settings = settings;
		this.plugin = plugin;
	}

	onload() {
		this.displayImages();
	}

	onunload() {
		this.plugin.imageGridLeaf = null;
	}

	addImage(imagePath: string) {
		this.images.push(imagePath);
		this.displayImages();
	}

	displayImages() {
		const container = this.containerEl;
		container.empty();
		const grid = container.createEl('div', { cls: 'image-grid' });

		this.images.forEach(imagePath => {
			const imgWrapper = grid.createEl('div', { cls: 'image-wrapper' });
			const img = imgWrapper.createEl('img', { attr: { src: this.app.vault.adapter.getResourcePath(imagePath) } });
			img.style.objectFit = 'contain';
			img.style.width = '100%';
			img.style.height = '100%';

			img.oncontextmenu = (event: MouseEvent) => {
				event.preventDefault();
				this.images = this.images.filter(imgPath => imgPath !== imagePath);
				this.displayImages();
			};
		});

		// Update grid layout based on the settings
		grid.style.display = 'grid';
		grid.style.gridTemplateColumns = `repeat(${this.settings.maxColumns}, 1fr)`;
		grid.style.gridTemplateRows = `repeat(${this.settings.maxRows}, 1fr)`;
		grid.style.gap = '10px';

		if (this.settings.flexDirection === 'column') {
			grid.style.flexDirection = 'column';
		} else {
			grid.style.flexDirection = 'row';
		}
	}

	getViewType() {
		return 'image-grid-viewer';
	}

	getDisplayText() {
		return 'Image Grid Viewer';
	}
}

class ImageGridViewerSettingTab extends PluginSettingTab {
	plugin: ImageGridViewerPlugin;

	constructor(app: App, plugin: ImageGridViewerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Image Grid Viewer Settings' });

		new Setting(containerEl)
			.setName('Max Columns')
			.setDesc('Maximum number of columns in the grid view')
			.addText(text => text
				.setPlaceholder('Enter max columns')
				.setValue(this.plugin.settings.maxColumns.toString())
				.onChange(async (value) => {
					this.plugin.settings.maxColumns = parseInt(value) || DEFAULT_SETTINGS.maxColumns;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Max Rows')
			.setDesc('Maximum number of rows in the grid view')
			.addText(text => text
				.setPlaceholder('Enter max rows')
				.setValue(this.plugin.settings.maxRows.toString())
				.onChange(async (value) => {
					this.plugin.settings.maxRows = parseInt(value) || DEFAULT_SETTINGS.maxRows;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Flex Direction')
			.setDesc('Flex direction for the grid view (row or column)')
			.addDropdown(dropdown => dropdown
				.addOption('row', 'Row')
				.addOption('column', 'Column')
				.setValue(this.plugin.settings.flexDirection)
				.onChange(async (value) => {
					this.plugin.settings.flexDirection = value;
					await this.plugin.saveSettings();
				}));
	}
}

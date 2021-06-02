<template>
  <Page @loaded="onPageLoad" actionBarHidden="true">
    <GridLayout rows="*, auto" columns="auto, *">
      <OptionsList title="db" :items="items" />
      <GridLayout
        v-show="!toast && !progress"
        row="1"
        class="appbar"
        rows="*"
        columns="auto, *"
      >
        <Button class="ico" :text="icon.back" @tap="$navigateBack()" />
      </GridLayout>
      <Toast :toast="toast" :action="hideToast" />
      <GridLayout
        v-show="progress"
        row="1"
        colSpan="2"
        class="appbar snackBar"
        columns="auto, *"
      >
        <ActivityIndicator :busy="progress ? true : false" />
        <Label col="1" class="title" :text="progress" textWrap="true" />
      </GridLayout>
    </GridLayout>
  </Page>
</template>

<script>
import {
  ApplicationSettings,
  path,
  knownFolders,
  AndroidApplication,
  File,
  Folder,
  Observable,
  Application,
  getFileAccess,
} from "@nativescript/core";
import { localize } from "@nativescript/localize";
import Confirm from "../modals/Confirm";
import OptionsList from "../sub/OptionsList";
import Toast from "../sub/Toast";
import { mapState, mapActions } from "vuex";
import { openOrCreate } from "@akylas/nativescript-sqlite";
import * as utils from "~/shared/utils";

export default {
  components: { OptionsList, Toast },
  data() {
    return {
      backupFolder: null,
      progress: null,
      toast: null,
    };
  },
  computed: {
    ...mapState([
      "icon",
      "recipes",
      "cuisines",
      "categories",
      "yieldUnits",
      "units",
      "mealPlans",
      "importSummary",
    ]),
    items() {
      return [
        {},
        {
          type: "list",
          icon: "folder",
          title: "buFol",
          subTitle: this.backupFolder,
          action: this.setBackupFolder,
        },
        {
          type: "list",
          icon: "exp",
          title: "expBu",
          subTitle: localize("buInfo"),
          action: this.exportCheck,
        },
        {
          type: "list",
          icon: "imp",
          title: "impBu",
          subTitle: localize("impInfo"),
          action: this.openZipFile,
        },
        {},
      ];
    },
  },
  methods: {
    ...mapActions([
      "importListItems",
      "importRecipesFromJSON",
      "importRecipesFromDB",
      "importMealPlansFromJSON",
      "importMealPlansFromDB",
      "unlinkBrokenImages",
      "clearImportSummary",
    ]),
    onPageLoad({ object }) {
      object.bindingContext = new Observable();
      const ContentResolver = Application.android.nativeApp.getContentResolver();
      this.backupFolder = ApplicationSettings.getString("backupFolder");
      if (
        !this.backupFolder ||
        ContentResolver.getPersistedUriPermissions().isEmpty()
      ) {
        this.backupFolder = null;
      }
    },
    // BACKUP FOLDER PICKER
    setBackupFolder(startExport) {
      const ContentResolver = Application.android.nativeApp.getContentResolver();
      const FLAGS =
        android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION |
        android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
      utils.getBackupFolder().then((uri) => {
        if (uri != null) {
          if (this.backupFolder)
            ContentResolver.releasePersistableUriPermission(
              new android.net.Uri.parse(this.backupFolder),
              FLAGS
            );
          this.backupFolder = uri.toString();
          ApplicationSettings.setString("backupFolder", this.backupFolder);
          // PERSIST PERMISSIONS
          ContentResolver.takePersistableUriPermission(uri, FLAGS);
          if (startExport && this.backupFolder) {
            this.exportBackup();
          }
        }
      });
    },

    // EXPORT HANDLERS
    exportCheck() {
      const ContentResolver = Application.android.nativeApp.getContentResolver();
      if (!this.recipes.length) {
        this.toast = localize("aFBu");
        utils.timer(5, (val) => {
          if (!val) this.toast = val;
        });
      } else {
        if (
          !this.backupFolder ||
          ContentResolver.getPersistedUriPermissions().isEmpty()
        ) {
          this.setBackupFolder(true);
        } else this.exportBackup();
      }
    },
    exportBackup() {
      this.progress = localize("expip");
      this.hijackBackEvent();
      let date = new Date();
      let formattedDate =
        date.getFullYear() +
        "-" +
        ("0" + (date.getMonth() + 1)).slice(-2) +
        "-" +
        ("0" + date.getDate()).slice(-2) +
        "_" +
        ("0" + date.getHours()).slice(-2) +
        ("0" + date.getMinutes()).slice(-2) +
        ("0" + date.getSeconds()).slice(-2);

      // Copy db file to EnRecipes folder
      utils.copyDBToExport();

      let filename = `${localize("EnRecipes")}_${formattedDate}.zip`;
      let fromPath = path.join(knownFolders.documents().path, "EnRecipes");
      utils.Zip.zip(fromPath, this.backupFolder, filename)
        .then((res) => res && this.showExportSummary(filename))
        .catch((err) => {
          console.log("Backup error: ", err);
          this.progress = null;
          this.releaseBackEvent();
          this.setBackupFolder(true);
        });
    },
    showExportSummary(filename) {
      // delete copied db file
      getFileAccess().deleteFile(
        path.join(
          knownFolders.documents().getFolder("EnRecipes").path,
          "EnRecipes.db"
        )
      );
      this.progress = null;
      this.releaseBackEvent();
      let description = localize("buto", `"${filename}"`);
      this.$showModal(Confirm, {
        props: {
          title: "expSuc",
          description,
          okButtonText: "OK",
        },
      });
    },

    // IMPORT HANDLERS
    openZipFile() {
      utils.getBackupFile().then((uri) => {
        if (uri) {
          knownFolders.temp().clear();
          let dest = knownFolders.temp().path;
          utils.Zip.unzip(uri, dest)
            .then((res) => res && this.validateZipContent(res, uri))
            .catch(() => this.failedImport(localize("buInc")));
        }
      });
    },
    validateZipContent(dest, uri) {
      this.progress = localize("impip");
      this.hijackBackEvent();
      let cache = dest + "/EnRecipes";
      const recipesDB = cache + "/EnRecipes.db";
      const recipes = cache + "/recipes.json";
      const images = cache + "/Images";
      const userCuisines = cache + "/userCuisines.json";
      const userCategories = cache + "/userCategories.json";
      const userYieldUnits = cache + "/userYieldUnits.json";
      const userUnits = cache + "/userUnits.json";
      const mealPlans = cache + "/mealPlans.json";
      let vm = this;
      // IMPORT IMAGES FINALLY
      function importImages() {
        const timer = setInterval(() => {
          if (!vm.progress) clearInterval(timer);
          if (vm.progress && vm.importSummary.found) {
            Folder.exists(images)
              ? vm.importImages(uri)
              : vm.showImportSummary();
          }
        }, 100);
      }
      if (Folder.exists(cache)) {
        if (File.exists(recipesDB)) {
          // IMPORT FROM DB FILE
          this.extractData(recipesDB);
          importImages();
        } else if (File.exists(recipes)) {
          // IMPORT FROM JSON FILES
          this.isFileDataValid([
            {
              path: recipes,
              db: "recipes",
              file: "recipes.json",
            },
            {
              path: userCuisines,
              db: "userCuisines",
              file: "userCuisines.json",
            },
            {
              path: userCategories,
              db: "userCategories",
              file: "userCategories.json",
            },
            {
              path: userYieldUnits,
              db: "userYieldUnits",
              file: "userYieldUnits.json",
            },
            {
              path: userUnits,
              db: "userUnits",
              file: "userUnits.json",
            },
            {
              path: mealPlans,
              db: "mealPlans",
              file: "mealPlans.json",
            },
          ]);
          importImages();
        } else this.failedImport(localize("buEmp"));
      } else this.failedImport(localize("buInc"));
    },
    isFileDataValid(file) {
      const files = file.filter((e) => File.exists(e.path));
      if (files.length) {
        let isValid = files.map(() => false);
        files.forEach((file, i) => {
          File.fromPath(file.path)
            .readText()
            .then((data) => {
              isValid[i] = this.hasValidJSON(data);
              if (!isValid[i]) {
                this.failedImport(
                  `${localize("buMod")}\n\n${localize("invFile")}: ${file.file}`
                );
                return 0;
              }
              if (isValid.every((e) => e === true)) {
                files.forEach((file) => {
                  File.fromPath(file.path)
                    .readText()
                    .then((data) => {
                      this.importData(JSON.parse(data), file.db);
                    });
                });
              }
            });
        });
      } else this.failedImport(localize("buEmp"));
    },
    failedImport(description) {
      this.progress = null;
      this.releaseBackEvent();
      knownFolders.temp().clear();
      this.$showModal(Confirm, {
        props: {
          title: "impFail",
          description,
          okButtonText: "OK",
        },
      });
    },
    hasValidJSON(data) {
      try {
        JSON.parse(data) && Array.isArray(JSON.parse(data));
      } catch (e) {
        return false;
      }
      return true;
    },
    extractData(recipesDB) {
      const db = openOrCreate(recipesDB);

      // Import recipes
      db.select("SELECT * FROM recipes").then((res) => {
        this.importRecipesFromDB(res);
      });

      // Import listitems
      db.select(
        `SELECT cuisines, categories, yieldUnits, units FROM lists`
      ).then((res) =>
        Object.keys(res[0]).forEach((listName) =>
          this.importListItems({
            data: JSON.parse(res[0][listName]),
            listName,
          })
        )
      );

      // Import mealPlans
      db.select(`SELECT * FROM mealPlans`).then((res) =>
        this.importMealPlansFromDB(res)
      );
    },
    importData(data, db) {
      switch (db) {
        case "recipes":
          this.importRecipesFromJSON(data);
          break;
        case "userCuisines":
          this.importListItems({
            data,
            listName: "cuisines",
          });
          break;
        case "userCategories":
          this.importListItems({
            data,
            listName: "categories",
          });
          break;
        case "userYieldUnits":
          this.importListItems({
            data,
            listName: "yieldUnits",
          });
          break;
        case "userUnits":
          this.importListItems({
            data,
            listName: "units",
          });
          break;
        case "mealPlans":
          this.importMealPlansFromJSON(data);
          break;
      }
    },
    importImages(uri) {
      let destPath = knownFolders.documents().path;
      Folder.fromPath(destPath);
      utils.Zip.unzip(uri, destPath).then((res) => {
        if (res) {
          // delete unzipped data files
          Folder.fromPath(path.join(destPath, "EnRecipes"))
            .getEntities()
            .then((entities) => {
              entities.forEach((entity) => {
                if (/.json|.db/.test(entity._extension))
                  File.fromPath(entity._path).remove();
              });
            });

          this.showImportSummary();
          this.unlinkBrokenImages();
        }
      });
    },
    showImportSummary() {
      this.progress = null;
      this.releaseBackEvent();
      let { found, imported, updated } = this.importSummary;
      let exists = Math.abs(found - imported - updated) + updated;
      let importedNote = `\n${localize("recI")} ${imported}`;
      let existsNote = `\n${localize("recE")} ${exists}`;
      let updatedNote = `\n${localize("recU")} ${updated}`;
      this.$showModal(Confirm, {
        props: {
          title: "impSuc",
          description: `${found} ${localize(
            "recF"
          )}\n${importedNote}${existsNote}${updatedNote}`,
          okButtonText: "OK",
        },
      }).then(() => this.clearImportSummary());
    },

    // NAVIGATION HANDLERS
    hijackBackEvent() {
      AndroidApplication.on(
        AndroidApplication.activityBackPressedEvent,
        this.backEvent
      );
    },
    releaseBackEvent() {
      AndroidApplication.off(
        AndroidApplication.activityBackPressedEvent,
        this.backEvent
      );
    },
    backEvent(args) {
      args.cancel = true;
    },

    // HELPERS
    hideToast() {
      this.toast = null;
    },
  },
};
</script>
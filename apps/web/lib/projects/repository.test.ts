import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectMeta, StoredProject } from "@/lib/storage/schema";

const projectsStore = new Map<string, StoredProject>();
const metaStore = new Map<string, ProjectMeta>();

const mockDb = {
  count: vi.fn(async (storeName: string) =>
    storeName === "projects" ? projectsStore.size : metaStore.size,
  ),
  get: vi.fn(async (storeName: string, key: string) => {
    if (storeName === "projects") return projectsStore.get(key);
    if (storeName === "projectMeta") return metaStore.get(key);
    return undefined;
  }),
  getAll: vi.fn(async (storeName: string) => {
    if (storeName === "projects") return Array.from(projectsStore.values());
    if (storeName === "projectMeta") return Array.from(metaStore.values());
    return [];
  }),
  transaction: vi.fn(() => ({
    objectStore(storeName: string) {
      return {
        put: vi.fn(async (value: StoredProject | ProjectMeta) => {
          if (storeName === "projects") {
            projectsStore.set(value.id, value as StoredProject);
          } else if (storeName === "projectMeta") {
            metaStore.set(value.id, value as ProjectMeta);
          }
          return value.id;
        }),
      };
    },
    done: Promise.resolve(),
  })),
};

vi.mock("@/lib/storage/db", () => ({
  getDB: vi.fn(async () => mockDb),
}));

const {
  filterProjectsByView,
  saveProject,
  setProjectArchived,
  uniqueProjectName,
} = await import("@/lib/projects/repository");

function makeMeta(
  id: string,
  overrides: Partial<ProjectMeta> = {},
): ProjectMeta {
  return {
    id,
    name: `Project ${id}`,
    createdAt: 1000,
    updatedAt: 1000,
    fileCount: 1,
    mainFilePath: "main.tex",
    searchText: `project ${id}`,
    folderId: null,
    ...overrides,
  };
}

describe("filterProjectsByView", () => {
  const sharedIds = new Set(["shared-active", "shared-archived"]);
  const projects: ProjectMeta[] = [
    makeMeta("local-active", { folderId: "f1" }),
    makeMeta("local-legacy-undefined-archive", { folderId: "f2" }),
    makeMeta("local-archived", {
      folderId: "f1",
      archived: true,
      archivedAt: 2000,
    }),
    makeMeta("shared-active", { folderId: "f1" }),
    makeMeta("shared-archived", {
      folderId: "f2",
      archived: true,
      archivedAt: 3000,
    }),
  ];

  it("excludes archived projects from all view", () => {
    const result = filterProjectsByView(projects, "all", sharedIds);
    expect(result.map((project) => project.id)).toEqual([
      "local-active",
      "local-legacy-undefined-archive",
      "shared-active",
    ]);
  });

  it("excludes archived and shared projects from yours view", () => {
    const result = filterProjectsByView(projects, "yours", sharedIds);
    expect(result.map((project) => project.id)).toEqual([
      "local-active",
      "local-legacy-undefined-archive",
    ]);
  });

  it("excludes archived projects from shared view", () => {
    const result = filterProjectsByView(projects, "shared", sharedIds);
    expect(result.map((project) => project.id)).toEqual(["shared-active"]);
  });

  it("excludes archived projects from folder views", () => {
    const f1 = filterProjectsByView(projects, "folder:f1", sharedIds);
    expect(f1.map((project) => project.id)).toEqual([
      "local-active",
      "shared-active",
    ]);

    const f2 = filterProjectsByView(projects, "folder:f2", sharedIds);
    expect(f2.map((project) => project.id)).toEqual([
      "local-legacy-undefined-archive",
    ]);
  });

  it("returns only archived projects in archived view", () => {
    const result = filterProjectsByView(projects, "archived", sharedIds);
    expect(result.map((project) => project.id)).toEqual([
      "local-archived",
      "shared-archived",
    ]);
  });
});

describe("uniqueProjectName", () => {
  it("keeps desired name when no conflict exists", () => {
    expect(uniqueProjectName("  Quantum Notes  ", ["Thesis", "Slides"])).toBe(
      "Quantum Notes",
    );
  });

  it("falls back to Untitled Project when blank", () => {
    expect(uniqueProjectName("   ", [])).toBe("Untitled Project");
    expect(uniqueProjectName("", ["Untitled Project"])).toBe(
      "Untitled Project 2",
    );
  });

  it("deduplicates case-insensitively with incrementing suffixes", () => {
    expect(uniqueProjectName("Paper", ["paper", "Paper 2", "PAPER 3"])).toBe(
      "Paper 4",
    );
  });
});

describe("archive persistence", () => {
  beforeEach(() => {
    projectsStore.clear();
    metaStore.clear();
    vi.clearAllMocks();
  });

  it("archives and restores a project and preserves archive metadata across autosaves", async () => {
    const baseProject: StoredProject = {
      id: "proj-1",
      name: "Manuscript",
      createdAt: 100,
      updatedAt: 100,
      files: [
        {
          id: "f1",
          name: "main.tex",
          path: "main.tex",
          type: "tex",
          content: "\\section{Intro}",
        },
      ],
      activeFileId: "f1",
      mainFileId: "f1",
      compiler: "pdflatex",
      folderId: "folder-1",
    };

    await saveProject(baseProject);
    expect(metaStore.get("proj-1")?.archived).toBe(false);
    expect(metaStore.get("proj-1")?.archivedAt).toBeNull();

    await setProjectArchived("proj-1", true);
    const archivedProject = projectsStore.get("proj-1");
    expect(archivedProject?.archived).toBe(true);
    expect(typeof archivedProject?.archivedAt).toBe("number");
    expect(metaStore.get("proj-1")?.archived).toBe(true);
    expect(metaStore.get("proj-1")?.archivedAt).toBe(
      archivedProject?.archivedAt,
    );

    // Simulate autosave omitting folderId, archived, and archivedAt
    await saveProject({
      ...baseProject,
      updatedAt: 500,
      folderId: undefined,
      archived: undefined,
      archivedAt: undefined,
    });

    expect(projectsStore.get("proj-1")?.folderId).toBe("folder-1");
    expect(projectsStore.get("proj-1")?.archived).toBe(true);
    expect(projectsStore.get("proj-1")?.archivedAt).toBe(
      archivedProject?.archivedAt,
    );
    expect(metaStore.get("proj-1")?.archived).toBe(true);

    await setProjectArchived("proj-1", false);
    expect(projectsStore.get("proj-1")?.archived).toBe(false);
    expect(projectsStore.get("proj-1")?.archivedAt).toBeNull();
    expect(metaStore.get("proj-1")?.archived).toBe(false);
    expect(metaStore.get("proj-1")?.archivedAt).toBeNull();
  });
});

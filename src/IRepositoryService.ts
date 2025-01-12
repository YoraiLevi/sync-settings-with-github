
export interface IRepositoryService {
    push: () => Promise<void>;
    pull: () => Promise<void>;
    forcePush: () => Promise<void>;
    forcePull: () => Promise<void>;
}

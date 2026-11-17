"""Structured, bounded errors exposed by the Repo Map tools."""


class RepoMapError(Exception):
    def __init__(self, code, message, *, retryable=False, next_action=None, details=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.next_action = next_action
        self.details = details or {}

    def as_dict(self):
        return {
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
            "next_action": self.next_action,
            "details": self.details,
        }
